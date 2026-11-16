import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 桌面端右下角看板娘（点击回到顶部）
 * - 仅在桌面宽屏（>=1280px / xl）展示，全屏与移动端自动隐藏
 * - 页面向下滚动超过 240px 后，采用 Q 弹 Spring 动效探出
 * - 回到顶部退场时采用平滑缓动（0.45s）优雅缩回，清晰展现收回动画
 * - 交互 Hitbox 与动效层彻底解耦，杜绝边缘悬停时的死循环抽搐（动画打架）
 * - 避让右侧原生滚动条，确保拖拽滚动条时不误触，点击 100% 灵敏回到顶部
 */
export function BackToTopMascot() {
  const [isVisible, setIsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const scrollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      // 迟滞防抖：向下超过 240px 探出，回滚到顶部 50px 以内平稳收回
      setIsVisible((prev) => {
        if (currentY > 240) return true
        if (currentY < 50) return false
        return prev
      })
      setIsScrolling(true)

      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current)
      }
      // 滚动停止 100ms 后恢复交互
      scrollTimerRef.current = window.setTimeout(() => {
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
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{
            x: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 260, damping: 22 },
          }}
          exit={{
            x: '100%',
            opacity: 0,
            transition: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
          }}
          className={`fixed right-3 bottom-8 z-40 hidden select-none xl:block focus:outline-none transform-gpu isolate ${
            isScrolling ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
          }`}
          onClick={scrollToTop}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          aria-label="回到顶部"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              scrollToTop()
            }
          }}
        >
          {/* 纯视觉层：鼠标事件绑定在外层固定 Hitbox 上，内部位移不影响鼠标命中，彻底消除悬停震荡 */}
          <motion.div
            animate={{
              x: isHovered ? -8 : 0,
            }}
            whileTap={{ scale: 0.94, y: 2 }}
            transition={{
              type: 'spring',
              stiffness: 340,
              damping: 24,
            }}
            className="pointer-events-none"
          >
            <div className="relative">
              {/* 1. 受惊闪电符号：平时隐藏，鼠标 Hover 时弹跳探出 */}
              <motion.div
                initial={false}
                animate={
                  isHovered
                    ? {
                        opacity: 1,
                        scale: 1,
                        rotate: 0,
                      }
                    : {
                        opacity: 0,
                        scale: 0.2,
                        rotate: -10,
                      }
                }
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 20,
                }}
                style={{
                  position: 'absolute',
                  left: '0%',
                  top: '10.25%',
                  width: '27.27%',
                  pointerEvents: 'none',
                  transformOrigin: 'bottom right',
                }}
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
              </motion.div>

              {/* 2. 看板娘身体本体 */}
              <picture>
                <source srcSet="/assets/mascot-body.webp" type="image/webp" />
                <img
                  src="/assets/mascot-body.png"
                  alt="回到顶部"
                  draggable={false}
                  decoding="async"
                  className="h-auto w-[115px] 2xl:w-[130px] transform-gpu drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                />
              </picture>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
