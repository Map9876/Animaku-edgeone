import { useEffect, useRef, useState } from 'react'

/**
 * 桌面端右下角看板娘（点击回到顶部）
 * - 仅在桌面宽屏（>=1280px / xl）展示，全屏与移动端自动隐藏
 * - 页面向下滚动超过 240px 后，采用 GPU 合成器超调贝塞尔（cubic-bezier）优雅探出
 * - 回到顶部退场时采用平滑缓动（0.38s）优雅缩回
 * - 架构调优（100% 纯 CSS 合成器驱动，脱离 JS 主线程）：
 *   1. 常驻挂载（Always Mounted）：首屏提前完成图片加载与解码，消除滚动瞬间的 DOM 插入与冷启动掉帧
 *   2. 超调贝塞尔代替 JS Spring：transform/opacity 由浏览器 Compositor 硬件加速独立插值，杜绝 Safari 惯性滚动争抢
 *   3. 交互 Hitbox 与纯视觉层彻底解耦：外层固定捕获鼠标，内层 group-hover 纯 CSS 探出，彻底消除抖动
 *   4. 原生 CSS group-active 反馈：杜绝 pointer-events-none 阻断 Framer Motion 导致按下缩放失效的缺陷
 */
export function BackToTopMascot() {
  const [isVisible, setIsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)

  const isVisibleRef = useRef(false)
  const isScrollingRef = useRef(false)
  const scrollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      // 迟滞防抖：向下超过 240px 探出，回滚到顶部 50px 以内平稳收回
      const nextVisible = currentY > 240 ? true : currentY < 50 ? false : isVisibleRef.current

      // 使用 ref 严格守卫，仅在状态真正发生跃变时才调用 setState，避免高频滚动产生任何微小调度开销
      if (nextVisible !== isVisibleRef.current) {
        isVisibleRef.current = nextVisible
        setIsVisible(nextVisible)
      }

      if (!isScrollingRef.current) {
        isScrollingRef.current = true
        setIsScrolling(true)
      }

      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current)
      }
      // 滚动停止 100ms 后恢复交互
      scrollTimerRef.current = window.setTimeout(() => {
        isScrollingRef.current = false
        setIsScrolling(false)
      }, 100)
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    handleScroll()
    handleFullscreenChange()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // 全屏模式下完全隐藏，避免影响看番
  if (isFullscreen) return null

  return (
    <div
      role="button"
      tabIndex={isVisible ? 0 : -1}
      aria-hidden={!isVisible}
      aria-label="回到顶部"
      onClick={scrollToTop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          scrollToTop()
        }
      }}
      className={`group fixed right-3 bottom-8 z-40 hidden select-none xl:block focus:outline-none ${
        isVisible && !isScrolling ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
      }`}
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(150px)',
        opacity: isVisible ? 1 : 0,
        // 入场采用超调贝塞尔（easeOutBack）提供 Q 弹回弹，退场采用平滑贝塞尔（easeOut）干脆收回
        transition: isVisible
          ? 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out'
          : 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s ease-in',
        willChange: 'transform, opacity',
      }}
    >
      {/* 纯视觉层：鼠标事件绑定在外层固定 Hitbox 上，内部位移不影响鼠标命中，且原生 active 驱动按下缩小 */}
      <div className="pointer-events-none transition-transform duration-200 ease-out group-hover:-translate-x-2 group-active:scale-[0.94] group-active:translate-y-[2px]">
        <div
          className="relative"
          style={{
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* 1. 受惊闪电符号：平时隐藏，鼠标 Hover 时弹跳探出（纯 CSS 超调弹性） */}
          <div
            style={{
              position: 'absolute',
              left: '0%',
              top: '10.25%',
              width: '27.27%',
              transformOrigin: 'bottom right',
            }}
            className="pointer-events-none opacity-0 scale-50 -rotate-12 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0"
          >
            <picture>
              <source srcSet="/assets/mascot-spark.webp" type="image/webp" />
              <img
                src="/assets/mascot-spark.png"
                alt=""
                aria-hidden
                draggable={false}
                decoding="async"
                className="h-auto w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
              />
            </picture>
          </div>

          {/* 2. 看板娘身体本体 */}
          <picture>
            <source srcSet="/assets/mascot-body.webp" type="image/webp" />
            <img
              src="/assets/mascot-body.png"
              alt="回到顶部"
              draggable={false}
              decoding="async"
              className="h-auto w-[115px] 2xl:w-[130px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
            />
          </picture>
        </div>
      </div>
    </div>
  )
}

