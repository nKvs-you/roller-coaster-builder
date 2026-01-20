/**
 * WebGL Detection Utility
 * Detects WebGL availability and provides fallback options
 */

export interface WebGLSupport {
  webgl1: boolean;
  webgl2: boolean;
  supported: boolean;
  renderer: string | null;
  vendor: string | null;
  error: string | null;
}

let cachedSupport: WebGLSupport | null = null;

/**
 * Check if WebGL is supported
 */
export function detectWebGL(): WebGLSupport {
  if (cachedSupport) return cachedSupport;
  
  const support: WebGLSupport = {
    webgl1: false,
    webgl2: false,
    supported: false,
    renderer: null,
    vendor: null,
    error: null,
  };
  
  try {
    const canvas = document.createElement('canvas');
    
    // Try WebGL 2 first
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = 
      canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    
    if (gl) {
      support.webgl2 = true;
      support.webgl1 = true;
      support.supported = true;
    } else {
      // Fall back to WebGL 1
      gl = canvas.getContext('webgl') as WebGLRenderingContext | null ||
           canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      
      if (gl) {
        support.webgl1 = true;
        support.supported = true;
      }
    }
    
    if (gl) {
      // Get renderer info
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        support.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        support.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      }
    } else {
      support.error = 'WebGL not supported by this browser';
    }
  } catch (e) {
    support.error = e instanceof Error ? e.message : 'Unknown error detecting WebGL';
  }
  
  cachedSupport = support;
  return support;
}

/**
 * Quick check if WebGL is available
 */
export function isWebGLAvailable(): boolean {
  return detectWebGL().supported;
}

/**
 * Force disable WebGL (for testing fallback)
 */
export function forceDisableWebGL(): void {
  cachedSupport = {
    webgl1: false,
    webgl2: false,
    supported: false,
    renderer: null,
    vendor: null,
    error: 'WebGL manually disabled',
  };
}

/**
 * Reset WebGL detection cache
 */
export function resetWebGLCache(): void {
  cachedSupport = null;
}
