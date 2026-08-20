import { mountSidebar, unmountSidebar, isSidebarMounted } from './mount';
import { onYoutubeNavigate, isWatchPage } from './spa-navigation';

function syncSidebarToCurrentPage(url: string): void {
  if (isWatchPage(url)) {
    if (!isSidebarMounted()) mountSidebar();
  } else {
    unmountSidebar();
  }
}

syncSidebarToCurrentPage(window.location.href);
onYoutubeNavigate(syncSidebarToCurrentPage);
