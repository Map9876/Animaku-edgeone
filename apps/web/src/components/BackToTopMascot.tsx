import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 桌面端右下角看板娘（点击回到顶部）
 * - 仅在桌面宽屏（>=1280px / xl）展示，缩小状态与移动端自动隐藏，绝不遮挡主内容
 * - 页面向下滚动超过 200px 后，采用原版 Q 弹果冻弹簧动效从右侧滑入探出
 * - 加锁时机优化：
 *   1. 滚动进行中（如拖拽滚动条、滚轮疾滚）保持 pointer-events-none 穿透，绝不打扰用户滚动
 *   2. 动画到达末梢后增加 180ms 落定缓冲，给回弹留出自然做完的充足时间，绝不打断回弹
 *   3. 动画与悬停解耦，只有当彻底停稳且鼠标主动移入时才探头，彻底消除回弹末端的跳动
 */
export function BackToTopMascot() {
  const [isVisible, setIsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const [isSettled, setIsSettled] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const scrollTimerRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 200)
      setIsScrolling(true)

      // 滚动期间保持静音，防止拖动滚动条时被误触发
      setIsHovered(false)

      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current)
      }
      // 停止滚动 180ms 后，才视作滚动动作彻底结束
      scrollTimerRef.current = window.setTimeout(() => {
        setIsScrolling(false)
      }, 180)
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
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
    }
  }, [])

  // 当离开展示区域开始退场时，立刻上锁
  useEffect(() => {
    if (!isVisible) {
      setIsSettled(false)
      setIsHovered(false)
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current)
      }
    }
  }, [isVisible])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // 必须是：动画彻底停稳 + 页面当前未处于滚动状态
  const canInteract = isSettled && !isScrolling

  // 全屏模式下完全隐藏，避免影响看番
  if (isFullscreen) return null

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          // 原汁原味、完全不变的 Q 弹 Spring 动画参数
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          // 动画状态锁：给弹簧末梢的回弹留足自然完成时间（180ms），彻底静止后才解锁
          onAnimationComplete={() => {
            if (isVisible) {
              if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
              settleTimerRef.current = window.setTimeout(() => {
                setIsSettled(true)
              }, 180)
            }
          }}
          className={`fixed right-0 bottom-8 z-40 hidden select-none xl:block focus:outline-none ${
            canInteract ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {/* 内层容器：通过真实 active hover 状态驱动，避免原地死光标在解锁瞬间导致跳动 */}
          <motion.div
            animate={{
              x: canInteract && isHovered ? -10 : 0,
            }}
            whileTap={canInteract ? { scale: 0.92, y: 3 } : undefined}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 24,
            }}
            onClick={canInteract ? scrollToTop : undefined}
            onMouseEnter={() => {
              if (canInteract) setIsHovered(true)
            }}
            onMouseLeave={() => {
              setIsHovered(false)
            }}
            onFocus={() => {
              if (canInteract) setIsHovered(true)
            }}
            onBlur={() => {
              setIsHovered(false)
            }}
            aria-label="回到顶部"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (canInteract && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                scrollToTop()
              }
            }}
            className="focus:outline-none"
          >
            <div className="relative">
              {/* 1. 受惊闪电符号：平时隐藏，鼠标 Hover / Focus 聚焦时弹簧弹性弹出 + 轻颤动效 */}
              <motion.div
                initial={false}
                animate={
                  canInteract && isHovered
                    ? {
                        opacity: 1,
                        scale: [0, 1.25, 0.92, 1],
                        rotate: [-14, 3, -1, 0],
                      }
                    : {
                        opacity: 0,
                        scale: 0.2,
                        rotate: -10,
                      }
                }
                transition={{
                  duration: 0.28,
                  ease: 'easeOut',
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
                    className="h-auto w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
                  />
                </picture>
              </motion.div>

              {/* 2. 看板娘身体本体：平时安静探头 */}
              <picture>
                <source srcSet="/assets/mascot-body.webp" type="image/webp" />
                <img
                  src="/assets/mascot-body.png"
                  alt="回到顶部"
                  draggable={false}
                  className="h-auto w-[115px] 2xl:w-[130px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all duration-200 hover:drop-shadow-[0_6px_20px_rgba(0,0,0,0.2)]"
                />
              </picture>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
