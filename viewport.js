(function (root) {
  'use strict';
  class Viewport {
    constructor() { this.x = 0; this.y = 0; this.scale = 1; }
    project(point) { return {x: point.x * this.scale + this.x, y: point.y * this.scale + this.y}; }
    unproject(point) { return {x: (point.x - this.x) / this.scale, y: (point.y - this.y) / this.scale}; }
    zoomAt(factor, anchor) {
      const world = this.unproject(anchor);
      this.scale = Math.max(.1, Math.min(8, this.scale * factor));
      this.x = anchor.x - world.x * this.scale;
      this.y = anchor.y - world.y * this.scale;
    }
    fit(points, width, height, radius) {
      if (!points.length) return;
      const left = Math.min(...points.map(p => p.x)) - radius - 12;
      const right = Math.max(...points.map(p => p.x)) + radius + 12;
      const top = Math.min(...points.map(p => p.y)) - radius - 12;
      const bottom = Math.max(...points.map(p => p.y)) + radius + 20;
      // Leave the lower part of the canvas free for the contraction instruction.
      const availableWidth = Math.max(1, width - 32), availableHeight = Math.max(1, height - 92);
      this.scale = Math.max(.1, Math.min(1, availableWidth / (right - left), availableHeight / (bottom - top)));
      this.x = width / 2 - (left + right) / 2 * this.scale;
      this.y = 16 + availableHeight / 2 - (top + bottom) / 2 * this.scale;
    }
    get transform() { return `translate(${this.x} ${this.y}) scale(${this.scale})`; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Viewport;
  else root.GraphViewport = Viewport;
})(typeof window === 'undefined' ? globalThis : window);
