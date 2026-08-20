import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cr from 'aws-cdk-lib/custom-resources';
import { CustomResource } from 'aws-cdk-lib/core';

/**
 * NoteSnap v1 AWS architecture (eu-west-1 — GDPR data residency for EU ad traffic).
 * See AWS-ARCHITECTURE-SPEC.md for the source design.
 *
 * GDPR posture baked in at the infra level:
 * - All storage (S3, RDS) encrypted at rest, EU-resident.
 * - S3 bucket holds only note content keyed by opaque IDs — no bucket-level PII in key names beyond user_id (a UUID/Cognito sub, not personal data on its own).
 * - RDS stores minimal PII (Cognito sub, video metadata) — no plaintext emails/names duplicated from Cognito.
 * - Deletion path (Article 17 erasure) is a first-class Lambda, not an afterthought — see bin/../lambda/delete-account.
 */
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------------
    // S3 — note content JSON (one object per note, per MVP-SPEC §3 schema)
    // ---------------------------------------------------------------------
    const notesBucket = new s3.Bucket(this, 'NotesBucket', {
      bucketName: undefined, // let CDK generate a unique name; avoids collisions across accounts/envs
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true, // free protection against a bad edit overwriting good content (AWS-ARCHITECTURE-SPEC §3.2)
      removalPolicy: cdk.RemovalPolicy.RETAIN, // stateful user data — never auto-destroy on stack teardown
    });

    // ---------------------------------------------------------------------
    // VPC + RDS PostgreSQL — notes metadata only (no note bodies here)
    // ---------------------------------------------------------------------
    const vpc = new ec2.Vpc(this, 'NoteSnapVpc', {
      maxAzs: 2,
      natGateways: 1, // needed so Lambdas in private subnets can reach the internet (Gemini API, Cognito, etc.)
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private-lambda', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'private-db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const dbCredentialsSecret = new secretsmanager.Secret(this, 'DbCredentialsSecret', {
      secretName: 'notesnap/rds/credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'notesnap_app' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'NoteSnap RDS PostgreSQL access - Lambda security group only',
      allowAllOutbound: false,
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'NoteSnap Lambda functions - outbound to RDS, Gemini API, Cognito',
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda functions to reach PostgreSQL',
    );

    const database = new rds.DatabaseInstance(this, 'NotesDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      databaseName: 'notesnap',
      storageEncrypted: true, // GDPR: encryption at rest for personal data (user_id, video metadata)
      multiAz: false, // deferred per AWS-ARCHITECTURE-SPEC §3.1 — not needed at launch scale
      // Account is on RDS free tier, which caps backup retention at 1 day
      // (CREATE_FAILED on 7 days: "exceeds the maximum available to free
      // tier customers"). Revisit once off free tier / at real launch scale.
      backupRetention: cdk.Duration.days(1),
      deletionProtection: true, // stateful user data — require explicit disable before destroy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------
    // Schema migration — applies lambda/schema.sql via a Custom Resource.
    // RDS sits in an isolated private subnet (no internet access, correctly),
    // so this runs inside the VPC as part of the CloudFormation deploy rather
    // than requiring a developer to reach the DB directly.
    // ---------------------------------------------------------------------
    const schemaMigrationFn = new nodejs.NodejsFunction(this, 'SchemaMigrationFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      entry: path.join(__dirname, '..', 'lambda', 'schema-migration.ts'),
      bundling: {
        minify: true,
        commandHooks: {
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${path.join(inputDir, 'lambda', 'schema.sql')} ${outputDir}`,
          ],
          beforeInstall: () => [],
        },
      },
      environment: {
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_NAME: 'notesnap',
        DB_CREDENTIALS_SECRET_ARN: dbCredentialsSecret.secretArn,
      },
    });
    dbCredentialsSecret.grantRead(schemaMigrationFn);

    const schemaMigrationProvider = new cr.Provider(this, 'SchemaMigrationProvider', {
      onEventHandler: schemaMigrationFn,
    });

    const schemaMigration = new CustomResource(this, 'SchemaMigrationResource', {
      serviceToken: schemaMigrationProvider.serviceToken,
      properties: {
        // Bump this to force re-run on a future deploy if schema.sql changes
        // in a way CloudFormation wouldn't otherwise detect.
        // v2: async generation columns (status, error_message, nullable
        // video_title/duration_s/s3_key) — see schema.sql's migration block.
        SchemaVersion: '2',
      },
    });
    schemaMigration.node.addDependency(database);

    // ---------------------------------------------------------------------
    // Cognito — auth (Google OAuth federation to be added once Google Cloud
    // OAuth client credentials exist — see AWS-ARCHITECTURE-SPEC §2)
    // ---------------------------------------------------------------------
    // Recreated as NoteSnapUserPoolV2 (new logical ID forces CloudFormation
    // replacement rather than an in-place update): Cognito requires any
    // attribute mapped from a federated IdP to be mutable — email was
    // mutable: false, which made every SECOND Google sign-in fail with
    // "email: Attribute cannot be updated" (Cognito re-syncs mapped
    // attributes from the IdP on every login, confirmed against AWS's own
    // federation docs during M2 testing). Mutability can't be changed on an
    // existing pool, only at creation. Old pool (eu-west-1_c5CtaR124) is
    // orphaned, not deleted, per its RETAIN removal policy — safe to delete
    // manually later, held no real user data (M2 only ever used a manually
    // obtained test token, never a real second-login flow).
    const userPool = new cognito.UserPool(this, 'NoteSnapUserPoolV2', {
      userPoolName: 'notesnap-users',
      selfSignUpEnabled: false, // Google-only sign-in — no username/password self-signup path
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.NONE, // no password recovery flow needed — Google-only auth
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // Amazon-provided hosted UI domain — gives Google Cloud Console a
    // concrete redirect URI (<prefix>.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse)
    // to register before Google federation can be added. A custom domain can
    // replace this later without changing the app client.
    const userPoolDomain = new cognito.UserPoolDomain(this, 'NoteSnapUserPoolDomain', {
      userPool,
      cognitoDomain: { domainPrefix: 'notesnap-auth' },
    });

    // Google OAuth client secret — populated out of band via
    // `aws secretsmanager create-secret --name notesnap/google-oauth/client-secret ...`,
    // never written into CDK source, per CLAUDE.md secret-safety rules.
    // SecretValue.secretsManager() resolves this via a dynamic reference at
    // deploy time, same pattern as the Gemini API key below.
    // fromSecretNameV2 produces a partial ARN that the dynamic-reference
    // resolver can't match (CREATE_FAILED: "Secrets Manager can't find the
    // specified secret") — the full ARN (with the random suffix Secrets
    // Manager appends) is required for {{resolve:secretsmanager:...}} to work.
    const googleClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'GoogleOAuthClientSecret',
      'arn:aws:secretsmanager:eu-west-1:699960288645:secret:notesnap/google-oauth/client-secret-q0YebW',
    );

    const googleIdentityProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdentityProvider', {
      userPool,
      clientId: '597653394020-j91911e776rhh21shgssslvvbt6ij68j.apps.googleusercontent.com',
      clientSecretValue: googleClientSecret.secretValue,
      scopes: ['email', 'openid', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'NoteSnapUserPoolClient', {
      userPool,
      generateSecret: false, // public client — Chrome extension via chrome.identity.launchWebAuthFlow
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        // Both the pinned dev-load extension ID (from extension-key.pem,
        // stable across unpacked reloads) and the placeholder are kept —
        // additive per the M4 plan, not a destructive swap. Add the real
        // Chrome Web Store-assigned ID here too once published (M9) rather
        // than replacing this entry.
        callbackUrls: [
          'https://placeholder.chromiumapp.org/',
          'https://ehamipkdlaimnakekeeepnecpfbbbfmp.chromiumapp.org/',
        ],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
    });
    userPoolClient.node.addDependency(googleIdentityProvider);

    // ---------------------------------------------------------------------
    // Gemini API key — placeholder secret. Populate the real value out of
    // band (console or `aws secretsmanager put-secret-value`), never via
    // code or chat, per CLAUDE.md secret-safety rules. Lambda receives it
    // through a CloudFormation dynamic reference, so the key never appears
    // in CDK synth output, Lambda console env-var display source, or logs
    // beyond what Lambda's own env-var UI always shows to authorized users.
    //
    // CORRECTION: dynamic references ({{resolve:secretsmanager:...}}) are NOT
    // supported for Lambda environment variables (confirmed against AWS docs
    // during M2 debugging — only certain resource types like RDS
    // MasterUserPassword support them). The env var silently resolved to
    // garbage instead of the real key. generate-notes.ts now fetches this
    // secret at runtime via the SDK instead (same pattern as lib/db.ts's RDS
    // credentials) — only the secret ARN is passed through the environment.
    // ---------------------------------------------------------------------
    const geminiApiKeySecret = new secretsmanager.Secret(this, 'GeminiApiKeySecret', {
      secretName: 'notesnap/gemini/api-key',
      description: 'Gemini API key for NoteSnap generate-notes Lambda - populate manually, never via CDK code',
    });

    // ---------------------------------------------------------------------
    // Lambda functions — generate/list/get/save/delete notes + GDPR erasure
    // ---------------------------------------------------------------------
    const sharedEnvironment = {
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_NAME: 'notesnap',
      DB_CREDENTIALS_SECRET_ARN: dbCredentialsSecret.secretArn,
      NOTES_BUCKET_NAME: notesBucket.bucketName,
    };

    const sharedFunctionProps: Partial<nodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(90), // generous for generate-notes; CRUD functions finish in low seconds (AWS-ARCHITECTURE-SPEC §4)
      memorySize: 512,
      bundling: { minify: true },
    };

    const generateNotesFn = new nodejs.NodejsFunction(this, 'GenerateNotesFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'generate-notes.ts'),
      environment: {
        ...sharedEnvironment,
        GEMINI_API_KEY_SECRET_ARN: geminiApiKeySecret.secretArn,
      },
      timeout: cdk.Duration.seconds(90),
    });
    geminiApiKeySecret.grantRead(generateNotesFn);
    // Self-invocation permission: the synchronous handler kicks off an
    // async InvocationType='Event' call to itself to do the real Gemini
    // work outside API Gateway's 29s integration timeout ceiling.
    // Both grantInvoke(self) and addToRolePolicy() reproduced the same
    // "Circular dependency between resources" CloudFormation error
    // (GenerateNotesFnServiceRoleDefaultPolicy <-> GenerateNotesFnA201B529
    // <-> the API Gateway integration/permission/log-group that also depend
    // on this function) — folding the self-invoke statement into the
    // function's shared DefaultPolicy resource ties that policy's existence
    // to the function's own ARN while other resources already depend on the
    // policy being resolved first. A standalone iam.Policy, attached after
    // both the function and role exist, breaks the cycle since it isn't
    // part of that same DefaultPolicy resource.
    new iam.Policy(this, 'GenerateNotesFnSelfInvokePolicy', {
      roles: [generateNotesFn.role!],
      statements: [
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [generateNotesFn.functionArn],
        }),
      ],
    });

    const listNotesFn = new nodejs.NodejsFunction(this, 'ListNotesFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'list-notes.ts'),
      environment: sharedEnvironment,
      timeout: cdk.Duration.seconds(15),
    });

    const getNoteFn = new nodejs.NodejsFunction(this, 'GetNoteFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'get-note.ts'),
      environment: sharedEnvironment,
      timeout: cdk.Duration.seconds(15),
    });

    const saveNoteEditFn = new nodejs.NodejsFunction(this, 'SaveNoteEditFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'save-note-edit.ts'),
      environment: sharedEnvironment,
      timeout: cdk.Duration.seconds(15),
    });

    const deleteNoteFn = new nodejs.NodejsFunction(this, 'DeleteNoteFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'delete-note.ts'),
      environment: sharedEnvironment,
      timeout: cdk.Duration.seconds(15),
    });

    const deleteAccountFn = new nodejs.NodejsFunction(this, 'DeleteAccountFn', {
      ...sharedFunctionProps,
      entry: path.join(__dirname, '..', 'lambda', 'delete-account.ts'),
      environment: { ...sharedEnvironment, USER_POOL_ID: userPool.userPoolId },
      timeout: cdk.Duration.seconds(30),
    });

    for (const fn of [generateNotesFn, listNotesFn, getNoteFn, saveNoteEditFn, deleteNoteFn, deleteAccountFn]) {
      dbCredentialsSecret.grantRead(fn);
      // Ensures the notes table exists before any CRUD Lambda could possibly
      // be invoked via a freshly-deployed API Gateway stage.
      fn.node.addDependency(schemaMigration);
    }
    notesBucket.grantRead(getNoteFn);
    notesBucket.grantWrite(generateNotesFn);
    notesBucket.grantWrite(saveNoteEditFn);
    notesBucket.grantDelete(deleteNoteFn);
    notesBucket.grantReadWrite(deleteAccountFn); // needs list + delete across the user's whole prefix

    deleteAccountFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));

    // ---------------------------------------------------------------------
    // API Gateway (HTTP API) with Cognito JWT authorizer
    // ---------------------------------------------------------------------
    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );

    const httpApi = new apigwv2.HttpApi(this, 'NoteSnapApi', {
      apiName: 'notesnap-api',
      corsPreflight: {
        allowOrigins: ['*'], // Chrome extension origins are chrome-extension://<id> - tighten to the published extension ID once known
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT, apigwv2.CorsHttpMethod.DELETE],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/notes/generate',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2Integrations.HttpLambdaIntegration('GenerateNotesIntegration', generateNotesFn),
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/notes',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2Integrations.HttpLambdaIntegration('ListNotesIntegration', listNotesFn),
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/notes/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2Integrations.HttpLambdaIntegration('GetNoteIntegration', getNoteFn),
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/notes/{id}',
      methods: [apigwv2.HttpMethod.PUT],
      integration: new apigwv2Integrations.HttpLambdaIntegration('SaveNoteEditIntegration', saveNoteEditFn),
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/notes/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new apigwv2Integrations.HttpLambdaIntegration('DeleteNoteIntegration', deleteNoteFn),
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/account',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new apigwv2Integrations.HttpLambdaIntegration('DeleteAccountIntegration', deleteAccountFn),
      authorizer: jwtAuthorizer,
    });

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------
    new cdk.CfnOutput(this, 'NotesBucketName', { value: notesBucket.bucketName });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: database.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'DbCredentialsSecretArn', { value: dbCredentialsSecret.secretArn });
    new cdk.CfnOutput(this, 'GeminiApiKeySecretArn', { value: geminiApiKeySecret.secretArn });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoHostedUiDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new cdk.CfnOutput(this, 'GoogleOAuthRedirectUri', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com/oauth2/idpresponse`,
      description: 'Paste this exact value into Google Cloud Console > Authorized redirect URIs',
    });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
  }
}
