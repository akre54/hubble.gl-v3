import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRenderer } from './renderer'

describe('useRenderer', () => {
  it('handles cancellation of the file save dialog', async () => {
    const mockShowSaveFilePicker = vi
      .spyOn(globalThis, 'showSaveFilePicker')
      .mockImplementation(() =>
        Promise.reject(new DOMException('The user aborted a request.', 'AbortError'))
      )
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

    // Setup useRenderer
    const mockRedraw = vi.fn()
    const mockSequence = {
      // Mock sequence.pointer.length to be a Theatre.js-like pointer for the hook
      pointer: {
        length: {},
      },
    }
    const mockProject = {
      // Mock project.address.projectId to be a Theatre.js-like project for the id
      address: { projectId: 'test-project-id' },
    }
    const { result } = renderHook(() =>
      useRenderer({
        project: mockProject,
        sequence: mockSequence,
        fps: 30,
        bitrate: 1000000,
        redraw: mockRedraw,
      })
    )

    // Call startCapture
    const mockCanvas = document.createElement('canvas')
    await result.current.startCapture({
      canvas: mockCanvas,
      width: 100,
      height: 100,
      endFrame: 10,
    })

    // Assertions
    expect(result.current.isRendering).toBe(false)
    expect(mockShowSaveFilePicker).toHaveBeenCalled()
    // It's hard to assert that redraw was not called "excessively" without knowing the exact number of calls.
    // We can assert that it was called a specific number of times if we know the expected behavior.
    // For now, let's assume it shouldn't be called at all if the save dialog is cancelled.
    expect(mockRedraw).not.toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith('Render setup cancelled by user (map container).')

    // Clean up mocks
    consoleLogSpy.mockRestore()
    mockShowSaveFilePicker.mockRestore()
  })
})
