import NProgress from 'nprogress';
import { useEffect } from 'react';
import { useNavigation } from 'react-router';

NProgress.configure({ showSpinner: false });

/** Drives an NProgress bar off React Router's navigation state, since
 * client-side transitions give no browser loading indicator otherwise. */
export function NavProgress() {
  const navigation = useNavigation();

  useEffect(() => {
    if (navigation.state === 'idle') {
      NProgress.done();
    } else {
      NProgress.start();
    }
  }, [navigation.state]);

  return null;
}
