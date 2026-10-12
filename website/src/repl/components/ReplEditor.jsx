import Loader from '@src/repl/components/Loader';
import { HorizontalPanel, MobilePanel, VerticalPanel } from '@src/repl/components/panel/Panel';
import { Code } from '@src/repl/components/Code';
import UserFacingErrorMessage from '@src/repl/components/UserFacingErrorMessage';
import { useEffect, useState } from 'react';
import { Header } from './Header';
import { useSettings } from '@src/settings.mjs';

// Matches Tailwind's `md` breakpoint so the hamburger and the desktop drawer never show together.
const MOBILE_PANEL_QUERY = '(max-width: 767px)';

function useIsMobilePanel() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_PANEL_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_PANEL_QUERY);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

// type Props = {
//  context: replcontext,
// }

export default function ReplEditor(Props) {
  const { context, ...editorProps } = Props;
  const { containerRef, editorRef, error, init, pending } = context;
  const settings = useSettings();
  const { panelPosition, isZen } = settings;
  const isMobilePanel = useIsMobilePanel();
  const showRightPanel = !isZen && panelPosition === 'right';
  const showMobileMenu = showRightPanel && isMobilePanel;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="h-full flex flex-col relative" {...editorProps}>
      <Loader active={pending} />
      <Header
        context={context}
        menu={
          showMobileMenu
            ? { open: mobileMenuOpen, onToggle: () => setMobileMenuOpen((open) => !open) }
            : undefined
        }
      />
      <div className="grow flex relative overflow-hidden">
        <Code containerRef={containerRef} editorRef={editorRef} init={init} />
        {showRightPanel && !isMobilePanel && <VerticalPanel context={context} />}
        {showMobileMenu && mobileMenuOpen && <MobilePanel context={context} />}
      </div>
      <UserFacingErrorMessage error={error} />
      {!isZen && panelPosition === 'bottom' && <HorizontalPanel context={context} />}
    </div>
  );
}
