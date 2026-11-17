import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { NavBrand } from './NavBrand'
import { NavLinks } from './NavLinks'
import { NavOnlineBadge } from './NavOnlineBadge'
import { NavSearch } from './NavSearch'
import { NavActions } from './NavActions'
import { NavMobileSearch } from './NavMobileSearch'

export function Navbar() {
  const location = useLocation()
  const [mobileSearchOpen, setMobileSearchOpen] = useState(
    () => location.pathname === '/search',
  )

  // Sync mobile search open state with search route
  useEffect(() => {
    if (location.pathname === '/search') {
      setMobileSearchOpen(true)
    } else {
      setMobileSearchOpen(false)
    }
  }, [location.pathname])

  const isWatch =
    location.pathname.startsWith('/subject/') ||
    location.pathname.startsWith('/play/')

  return (
    <header
      className={clsx(
        'relative z-40 border-b border-[var(--kz-border)] bg-[var(--kz-header-bg)] shadow-none',
        isWatch ? 'relative lg:sticky lg:top-0' : 'sticky top-0',
      )}
    >
      {/* Main unified navbar container: h-14 (56px) on mobile, h-16 (64px) on desktop */}
      <div className="relative mx-auto flex h-14 sm:h-16 w-full lg:w-[86%] lg:min-w-[1080px] lg:max-w-[1680px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-0">
        {/* Left side: Brand + Nav Tabs */}
        <div className="flex h-full min-w-0 items-center gap-3 sm:gap-6 lg:gap-8">
          <NavBrand />
          <NavLinks />
        </div>

        {/* Right side: Search + Actions */}
        <div className="flex h-full items-center gap-2 sm:gap-3">
          <NavOnlineBadge />
          <NavSearch />
          <NavActions
            mobileSearchOpen={mobileSearchOpen}
            onOpenMobileSearch={() => setMobileSearchOpen(true)}
          />
        </div>

        {/* Mobile full-header search overlay */}
        <NavMobileSearch
          open={mobileSearchOpen}
          onClose={() => {
            setMobileSearchOpen(false)
          }}
        />
      </div>
    </header>
  )
}
