import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 桌面端右下角看板娘（点击回到顶部）
 * - 仅在桌面宽屏（>=1280px / xl）展示，缩小状态与移动端自动隐藏，绝不遮挡主内容
 * - 页面向下滚动超过 200px 后，采用原版 Q 弹果冻弹簧动效从右侧滑入探出
 * - 动画状态锁：在弹簧进场未彻底停稳期间，开启 pointer-events-none（鼠标完全穿透），
 *   拖动滚动条路过时绝不会被外力干扰弹飞；只有完全停稳落定后才解锁 Hover、受惊闪电与点击回到顶部
 */
export function BackToTopMascot() {
  const [isVisible, setIsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isInteractive, setIsInteractive] = useState(false)
  // 动画状态锁：只有当入场弹簧完全结束并静止后，才允许交互
  const [isSettled, setIsSettled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // 滚动超过 200px 且不在全屏模式下时展示
      setIsVisible(window.scrollY > 200)
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
    }
  }, [])

  // 当页面回滚到顶部需要退出时，立刻上锁，避免退场期间被鼠标意外触发
  useEffect(() => {
    if (!isVisible) {
      setIsSettled(false)
      setIsInteractive(false)
    }
  }, [isVisible])

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
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          // 换回原本最喜欢的 Q 弹果冻弹簧参数
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          // 动画状态锁：只有当弹入完全结束且停稳在右边缘时，才解锁鼠标响应
          onAnimationComplete={() => {
            if (isVisible) {
              setIsSettled(true)
            }
          }}
          whileHover={isSettled ? { x: -10 } : undefined}
          whileTap={isSettled ? { scale: 0.92, y: 3 } : undefined}
          onClick={isSettled ? scrollToTop : undefined}
          onMouseEnter={() => {
            if (isSettled) setIsInteractive(true)
          }}
          onMouseLeave={() => {
            setIsInteractive(false)
          }}
          onFocus={() => {
            if (isSettled) setIsInteractive(true)
          }}
          onBlur={() => {
            setIsInteractive(false)
          }}
          aria-label="回到顶部"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (isSettled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              scrollToTop()
            }
          }}
          className={`fixed right-0 bottom-8 z-40 hidden select-none xl:block focus:outline-none ${
            isSettled ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="relative">
            {/* 1. 受惊闪电符号：平时隐藏，鼠标 Hover / Focus 聚焦时弹簧弹性弹出 + 轻颤动效 */}
            <motion.div
              initial={false}
              animate={
                isInteractive
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
      )}
    </AnimatePresence>
  )
}
