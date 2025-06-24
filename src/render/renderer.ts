import { assert } from '@deck.gl/core/typed'
import GL from '@luma.gl/constants'
import { Framebuffer, Texture2D, readPixelsToArray } from '@luma.gl/webgl'
import { type IProject, type ISequence, createRafDriver, val } from '@theatre/core'
import { FileSystemWritableFileStreamTarget, Muxer, type MuxerOptions } from 'mp4-muxer'
import { useCallback, useEffect, useRef, useState } from 'react'

export const rafDriver = createRafDriver({ name: 'WorldView' })

export const useFrameBuffer = (gl: WebGL2RenderingContext | null) => {
  const [framebuffers, setFrameBuffers] = useState(new Map<string, Framebuffer>())

  return useCallback(
    (id: string) => {
      if (gl && !framebuffers.has(id)) {
        const framebuffer = new Framebuffer(gl, {
          id,
          width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight,
        })
        framebuffer.attach({
          [GL.COLOR_ATTACHMENT0]: new Texture2D(gl, {
            mipmaps: false,
            parameters: {
              [GL.TEXTURE_MIN_FILTER]: GL.NEAREST,
              [GL.TEXTURE_MAG_FILTER]: GL.NEAREST,
              [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
              [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE,
            },
          }),
        })
        framebuffers.set(id, framebuffer)
        setFrameBuffers(new Map(framebuffers))
      }
      return framebuffers.get(id)
    },
    [framebuffers, gl]
  )
}

export const useRenderer = ({
  project,
  sequence,
  fps = 30,
  bitrate = 10_000_000, // 10mbps
  redraw,
}: {
  project: IProject
  sequence: ISequence
  fps?: number
  bitrate?: number
  redraw: () => void
}) => {
  // A way for the renderer to signal that the frame has finished drawing
  const fboRenderDone = useRef<(result?: { error?: Error; framebuffers?: Framebuffer[] }) => void>(
    () => {
      console.error('fboRenderDone called before it was set')
    }
  )
  const fboFrameReady = useCallback(
    () =>
      new Promise<{ error?: Error; framebuffers?: Framebuffer[] } | undefined>(resolve => {
        fboRenderDone.current = resolve
      }),
    []
  )
  const fboCaptureFrame = useCallback(
    (result?: { error?: Error; framebuffers?: Framebuffer[] }) => {
      console.log('fboCaptureFrame', result)
      if (!result?.framebuffers?.length) {
        console.warn('No framebuffers to capture')
      }
      fboRenderDone.current(result)
    },
    []
  )

  const canvasRenderDone = useRef<(result?: { error?: Error }) => void>(() => {})
  const canvasFrameReady = useCallback(
    () =>
      new Promise<{ error?: Error } | undefined>(resolve => {
        canvasRenderDone.current = resolve
      }),
    []
  )
  // The reference always points to the latest value, so the closure can't get stale
  const canvasCaptureFrame = useCallback((result?: { error?: Error }) => {
    canvasRenderDone.current(result)
  }, [])

  const currentFrame = useRef(0)

  const startCapture = useCallback(
    async ({
      canvas,
      width,
      height,
      codec,
      startFrame = 0,
      endFrame = Math.floor(val(sequence.pointer.length) * fps),
      layerGroups,
    }: {
      canvas: HTMLCanvasElement
      width: number
      height: number
      codec: NonNullable<MuxerOptions<FileSystemWritableFileStreamTarget>['video']>['codec']
      startFrame?: number
      endFrame?: number
      layerGroups: string[]
    }) => {
      assert(canvas, 'canvas is required')

      let i = startFrame

      setIsRendering(true)

      const projectName = project.address.projectId

      const getContainer = async (name: string) => {
        const fileHandle = await window
          .showSaveFilePicker({
            suggestedName: `${name}.mp4`,
            types: [
              {
                description: 'Video File',
                accept: { 'video/mp4': ['.mp4'] },
              },
            ],
          })
          .catch(error => {
            if (error.name === 'AbortError') {
              console.log('File picker cancelled by user for:', name)
            } else {
              console.error('Error in showSaveFilePicker for', name, ':', error)
            }
            return null // Signal cancellation/failure
          })

        if (!fileHandle) {
          return null
        }
        const fileWritableStream = await fileHandle.createWritable()

        const muxer = new Muxer({
          target: new FileSystemWritableFileStreamTarget(fileWritableStream),
          fastStart: 'in-memory', // Fastest and uses the least memory
          firstTimestampBehavior: 'offset',
          video: {
            codec,
            width,
            height,
          },
        })

        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta, (i / fps) * 1_000_000),
          error: e => console.error(e),
        })

        const codecMap = {
          hevc: {
            codec: 'hev1.1.6.L123.00',
            hevc: { format: 'annexb' },
          },
          avc: {
            codec: 'avc1.42002A',
          },
          vp9: {
            codec: 'vp09.00.10.08',
          },
          av1: {
            codec: 'v01.0.08M.10.0.110.09',
          },
        } as const

        const config = {
          width,
          height,
          bitrate,
          bitrateMode: 'constant',
          hardwareAcceleration: 'prefer-hardware',
          framerate: fps,
          ...codecMap[codec],
        } as const

        const { supported } = await VideoEncoder.isConfigSupported(config)

        if (!supported) {
          console.error('Unsupported codec configuration', config)
          debugger
        }

        videoEncoder.configure(config)

        async function encodeFrame(data: VideoFrame) {
          const keyFrame = i % 60 === 0
          videoEncoder.encode(data, { keyFrame })
        }

        async function finishEncoding() {
          await videoEncoder.flush()
          muxer.finalize()
          await fileWritableStream.close()
        }

        return {
          videoEncoder,
          encodeFrame,
          muxer,
          finishEncoding,
        }
      }

      await project.ready

      function getCanvasRecorder(canvas: HTMLCanvasElement) {
        const track = canvas.captureStream(0).getVideoTracks()[0]
        const mediaProcessor = new MediaStreamTrackProcessor({ track })
        const reader = mediaProcessor.readable.getReader()
        return { track, reader }
      }

      const mapContainer = await getContainer(`${projectName}-map`)
      if (!mapContainer) {
        setIsRendering(false)
        console.log('Render setup cancelled by user (map container).')
        return
      }
      const containers = new Map([['map', mapContainer]])

      for (const layer of layerGroups) {
        const deckLayerContainer = await getContainer(`${projectName}-${layer}`)
        if (!deckLayerContainer) {
          setIsRendering(false)
          console.log(`Render setup cancelled by user (layer container: ${layer}).`)
          // Note: No explicit cleanup of mapContainer's fileWritableStream here,
          // as the browser typically handles unclosed streams on script termination or handle loss.
          // The primary goal is to stop the process and reset rendering state.
          return
        }
        containers.set(layer, deckLayerContainer)
      }

      const mapRecorder = getCanvasRecorder(canvas)

      async function finishEncoding() {
        for (const container of containers.values()) {
          await container.finishEncoding()
        }
        mapRecorder?.reader?.releaseLock()
      }

      for (; i < endFrame + 1; i++) {
        const simTime = i / fps
        sequence.position = simTime
        rafDriver.tick(performance.now())
        // redraw in case nothing changes due to theatre raf driver
        // TODO: Where should this go so that the first frame captures?
        redraw()

        currentFrame.current = i
        console.log(`capturing frame ${i}/${endFrame} at simtime ${simTime}`)

        const [canvasResult, framebufferResult] = await Promise.all([
          canvasFrameReady(),
          fboFrameReady(),
        ])

        if (framebufferResult?.error) {
          console.error('Error capturing framebuffer frame:', framebufferResult.error)
          return
        }

        if (canvasResult?.error) {
          console.error('Error capturing canvas frame:', canvasResult.error)
          return
        }

        const addRecorderFrame = async (
          recorder: ReturnType<typeof getCanvasRecorder>,
          container: Awaited<ReturnType<typeof getContainer>>
        ) => {
          // @ts-expect-error - typescript types not updated yet
          recorder.track.requestFrame()
          console.log('requesting frame')
          const result = await recorder.reader.read()
          const frame = result.value
          console.log('got frame', frame)

          assert(frame, 'frame is required - might be a problem with the browser')

          await container?.encodeFrame(frame)
          frame.close()
        }

        const addFboFrame = async (
          framebuffer: Framebuffer,
          container: Awaited<ReturnType<typeof getContainer>>
        ) => {
          assert(framebuffer, 'framebuffer must be defined')
          const arr = readPixelsToArray(framebuffer, {})

          const data = new ImageData(
            new Uint8ClampedArray(arr),
            framebuffer.width,
            framebuffer.height
          )
          const img = await createImageBitmap(data, { imageOrientation: 'flipY' })

          const fboFrame = new VideoFrame(img, {
            timestamp: 0,
            codedHeight: framebuffer.height,
            codedWidth: framebuffer.width,
            format: 'RGBA',
          })

          // Draw canvas for debugging
          let canvas = document.querySelector<HTMLCanvasElement>('#output')
          if (!canvas) {
            canvas = document.createElement('canvas')
            canvas.id = 'output'
            canvas.width = framebuffer.width
            canvas.height = framebuffer.height
            document.body.appendChild(canvas)
          }
          const ctx = canvas.getContext('2d')
          ctx!.clearRect(0, 0, canvas.width, canvas.height)
          ctx!.drawImage(fboFrame, 0, 0)

          await container?.encodeFrame(fboFrame)
          fboFrame.close()
        }

        await addRecorderFrame(mapRecorder, mapContainer)

        if (framebufferResult?.framebuffers) {
          const { framebuffers } = framebufferResult
          for (const framebuffer of framebuffers.values()) {
            const container = containers.get(framebuffer.id)
            if (!container) {
              console.error(`No container found for framebuffer ${framebuffer.id}`)
              continue
            }
            await addFboFrame(framebuffer, container)
          }
        }
      }
      finishEncoding()
      setIsRendering(false)
    },
    [
      project,
      sequence,
      sequence.pointer.length,
      fps,
      bitrate,
      canvasFrameReady,
      fboFrameReady,
      redraw,
    ]
  )

  const [isRendering, setIsRendering] = useState(false)
  useEffect(() => {
    if (isRendering) {
      return
    }
    let tick: number
    const cb = () => {
      rafDriver.tick(performance.now())
      tick = requestAnimationFrame(cb)
    }
    tick = requestAnimationFrame(cb)
    return () => cancelAnimationFrame(tick)
  }, [isRendering])

  // Used to trigger a re-render of the canvas in Deck when the render is stuck
  const [_animate, setAnimate] = useState(false)
  const advanceFrame = useCallback(() => {
    setAnimate(true)
    requestAnimationFrame(() => setAnimate(false))
  }, [])

  return {
    startCapture,
    canvasCaptureFrame,
    fboCaptureFrame,
    currentFrame: currentFrame.current,
    advanceFrame,
    _animate,
    isRendering,
  }
}

export default useRenderer

export const captureScreenshot = async (
  suggestedName: string,
  getBufferedCanvas: () => HTMLCanvasElement,
  quality = 1
) => {
  const imageHandle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'PNG',
        accept: { 'image/png': ['.png'] },
      },
      {
        description: 'JPEG',
        accept: { 'image/jpeg': ['.jpeg'] },
      },
    ],
  })

  const file = await imageHandle.getFile()

  const blob = await new Promise<Blob>((resolve, reject) => {
    // canvas needs to redrawn immediately before capture or else buffer will be empty.
    getBufferedCanvas().toBlob(
      blob => (blob ? resolve(blob) : reject('canvas is empty')),
      file.type,
      quality
    )
  })

  const fileWritableStream = await imageHandle.createWritable()
  await fileWritableStream.write(blob)
  await fileWritableStream.close()
}
