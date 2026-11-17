import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 桌面端右下角看板娘（点击回到顶部）
 * - 仅在桌面宽屏（>=1280px / xl）展示，全屏与移动端自动隐藏
 * - 页面向下滚动超过 240px 后，采用 Q 弹 Spring 动效探出
 * - 回到顶部退场时采用平滑缓动（0.38s）优雅缩回
 * - 交互 Hitbox 与动效层彻底解耦，杜绝边缘悬停时的死循环抽搐（动画打架）
 * - 双端性能调优：
 *   1. 动效解耦：X 轴 100% 保留原本 Spring 物理弹性，Opacity 走平滑硬件淡入，彻底规避 Safari 透明度超调掉帧
 *   2. 数值位移替代百分比，消除 Safari 每帧盒模型几何重算
 *   3. 消除图层冲突并开启 WebKit 硬件图层固化，杜绝 drop-shadow 滤镜实时反复光栅化
 *   4. 滚动监听精细化，避免惯性滚动与 JS 弹簧争抢主线程
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

      // 仅在当前未处于滚动状态时才触发一次锁定，避免滚动期间连续触发 React 渲染
      setIsScrolling((scrolling) => (scrolling ? scrolling : true))

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
          initial={{ x: 150, opacity: 0 }}
          animate={{
            x: 0,
            opacity: 1,
            transition: {
              x: { type: 'spring', stiffness: 260, damping: 22 },
              opacity: { duration: 0.22, ease: 'easeOut' },
            },
          }}
          exit={{
            x: 150,
            opacity: 0,
            transition: { duration: 0.38, ease: [0.32, 0.72, 0, 1] },
          }}
          className={`fixed right-3 bottom-8 z-40 hidden select-none xl:block focus:outline-none ${
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
            {/* 固化 GPU 合成层：防止 Safari 在位移时每帧重绘 drop-shadow 滤镜 */}
            <div
              className="relative"
              style={{
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
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
                  className="h-auto w-[115px] 2xl:w-[130px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                />
              </picture>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
