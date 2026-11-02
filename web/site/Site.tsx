import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { BrandMark } from '../components/brand';
import { SiteIcon } from './art';
import { loadSite, schoolName, type PublicSite } from './data';
import { AboutPage, AnnouncementPage, AnnouncementsPage, CalendarPage, FaqPage, Home, NotFound } from './pages';

/**
 * The school's public front page. It reads one public endpoint, which returns
 * only what the principal or administrative officer published, and it routes
 * on real paths so a notice can be shared by its link. The staff workspace
 * lives at /app; nothing here signs anyone in.
 */
// The page's own file name is how a local preview reaches it; it means the home page.
const pathOf = () => { const p = location.pathname.replace(/\/+$/, ''); return !p || p === '/site.html' ? '/' : p; };

// Contact lives on the About page; /contact is kept so an old link still lands on it.
// Questions appear only once the school has published one, so the menu never leads to an empty page.
const nav = [['/', 'Home'], ['/announcements', 'Announcements'], ['/calendar', 'Calendar'], ['/faq', 'Questions'], ['/about', 'About & contact']] as const;

export type Go = (path: string) => void;

/** A same-site link that moves without reloading, and still works as a link when opened in a new tab. */
export function Link({ to, go, className, children, label }: { to: string; go: Go; className?: string | undefined; children: ReactNode; label?: string | undefined }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(to);
  };
  return <a href={to} className={className} onClick={click} aria-label={label}>{children}</a>;
}

type Transitioning = Document & { startViewTransition?: (update: () => void) => unknown };

export function Site() {
  const [path, setPath] = useState(pathOf);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [failed, setFailed] = useState('');
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement>(null);

  const fetchSite = useCallback(() => {
    setFailed('');
    loadSite().then(setSite).catch(error => setFailed(error instanceof Error ? error.message : 'The page could not be loaded.'));
  }, []);
  useEffect(fetchSite, [fetchSite]);

  const go: Go = useCallback(to => {
    if (to !== location.pathname) history.pushState(null, '', to);
    const apply = () => {
      flushSync(() => { setPath(to); setMenu(false); });
      window.scrollTo({ top: 0 });
    };
    // A soft cross-fade between pages where the browser offers one, and none for anyone who asked for less motion.
    const doc = document as Transitioning;
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply);
    else apply();
    // Tell a screen reader the page changed, the way a full load would.
    requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const back = () => { setPath(pathOf()); setMenu(false); };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  const name = site ? schoolName(site) : 'Balili Elementary School';
  const section = path.split('/')[1] ?? '';
  const announcementId = section === 'announcements' ? path.split('/')[2] : undefined;

  let page: ReactNode;
  let title = name;
  if (!site) page = failed ? <LoadFailed message={failed} retry={fetchSite} /> : <Loading />;
  else if (path === '/') page = <Home site={site} go={go} />;
  else if (announcementId) { const found = site.announcements.find(a => a.id === announcementId); title = found ? `${found.title} · ${name}` : name; page = <AnnouncementPage site={site} go={go} id={announcementId} />; }
  else if (path === '/announcements') { title = `Announcements · ${name}`; page = <AnnouncementsPage site={site} go={go} />; }
  else if (path === '/calendar') { title = `School calendar · ${name}`; page = <CalendarPage site={site} go={go} />; }
  else if (path === '/faq') { title = `Questions · ${name}`; page = <FaqPage site={site} go={go} />; }
  else if (path === '/about' || path === '/contact') { title = `About and contact · ${name}`; page = <AboutPage site={site} go={go} contact={path === '/contact'} />; }
  else page = <NotFound go={go} />;
  useEffect(() => { document.title = title; }, [title]);

  const current = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`) || (to === '/about' && path === '/contact'));

  return (
    <div className="site">
      <a className="skip-link" href="#content">Skip to the content</a>
      {site?.seeded ? (
        <div className="test-ribbon" role="note">
          <SiteIcon name="alert" size={16} />
          <span><b>Test copy.</b> This page shows sample notices while EDUNEXUS is being tested. Nothing here is an official announcement of the school.</span>
        </div>
      ) : null}
      <GovBar />
      <header className="site-header">
        <div className="wrap header-inner">
          <Link to="/" go={go} className="site-brand" label={`${name}, home`}>
            <span className="brand-tile"><BrandMark size={30} /></span>
            <span className="brand-words">
              <b>{name}</b>
              <small>{site?.school.school_code ? `DepEd School ID ${site.school.school_code}` : 'Department of Education'}</small>
            </span>
          </Link>
          <button type="button" className="menu-toggle" aria-expanded={menu} aria-controls="site-nav" onClick={() => setMenu(open => !open)}>
            <SiteIcon name={menu ? 'close' : 'menu'} size={22} /><span>{menu ? 'Close' : 'Menu'}</span>
          </button>
          <nav id="site-nav" className={`site-nav${menu ? ' open' : ''}`} aria-label="Main">
            <ul>
              {nav.filter(([to]) => to !== '/faq' || (site?.faqs?.length ?? 0) > 0).map(([to, label]) => (
                <li key={to}><Link to={to} go={go} className={current(to) ? 'active' : undefined}>{label}</Link></li>
              ))}
            </ul>
            <a className="portal-link" href="/app"><SiteIcon name="lock" size={15} />Staff portal</a>
          </nav>
        </div>
      </header>
      <main id="content" ref={main} tabIndex={-1}>{page}</main>
      <Footer site={site} name={name} go={go} />
    </div>
  );
}

/**
 * The government web template's top bar: the link to GOVPH and Philippine
 * Standard Time, which every government site carries. The clock reads the
 * reader's own device, shown in Manila's time zone.
 */
function GovBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  const shown = now.toLocaleString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return (
    <div className="gov-bar">
      <div className="wrap gov-inner">
        <a className="govph" href="https://www.gov.ph/" rel="noopener" target="_blank">GOVPH</a>
        <p className="pst"><span className="pst-label">Philippine Standard Time:</span> <time dateTime={now.toISOString()}>{shown}</time></p>
      </div>
    </div>
  );
}

function Footer({ site, name, go }: { site: PublicSite | null; name: string; go: Go }) {
  const s = site?.site;
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <span className="brand-tile"><BrandMark size={34} /></span>
          <div>
            <b>{name}</b>
            <p>{site ? site.school.address : 'La Trinidad, Benguet'}</p>
            <p className="footer-gov">Republic of the Philippines · Department of Education{site?.school.division ? ` · ${site.school.division}` : ''}</p>
          </div>
        </div>
        <div>
          <h2>Reach the school</h2>
          <ul className="footer-list">
            {s?.phone ? <li><a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a></li> : null}
            {s?.email ? <li><a href={`mailto:${s.email}`}>{s.email}</a></li> : null}
            {s?.office_hours ? <li>{s.office_hours}</li> : null}
            {site?.faqs?.length ? <li><Link to="/faq" go={go}>Questions from parents</Link></li> : null}
            <li><Link to="/about" go={go}>Visit and contact details</Link></li>
          </ul>
        </div>
        <div>
          <h2>DepEd</h2>
          <ul className="footer-list">
            <li><a href="https://www.deped.gov.ph/" rel="noopener" target="_blank">DepEd Philippines<SiteIcon name="external" size={13} /></a></li>
            <li><a href="https://car.deped.gov.ph/" rel="noopener" target="_blank">DepEd Cordillera<SiteIcon name="external" size={13} /></a></li>
            <li><a href="https://depedbenguet.com/" rel="noopener" target="_blank">DepEd Benguet<SiteIcon name="external" size={13} /></a></li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-base">
        <span>© {new Date().getFullYear()} {name}</span>
        <span>Records kept with <a href="/app">EDUNEXUS</a></span>
      </div>
    </footer>
  );
}

function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the school’s page…</span>
      <div className="skeleton-hero" />
      <div className="wrap skeleton-row"><div className="skeleton" /><div className="skeleton" /></div>
    </div>
  );
}

function LoadFailed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="wrap state-block" role="alert">
      <h1>The school’s page could not be loaded</h1>
      <p>{message} Check the connection and try again.</p>
      <button type="button" className="btn btn-primary" onClick={retry}>Try again</button>
    </div>
  );
}
