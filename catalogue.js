(function (root) {
  'use strict';
  function compare(a, b, sort = 'gap') {
    const knownLast = (a.gap === null) - (b.gap === null);
    const defaultOrder = knownLast || (b.gap || 0) - (a.gap || 0) ||
      a.ordinaryWidth - b.ordinaryWidth || a.n - b.n || a.m - b.m ||
      Number(a.id.slice(1)) - Number(b.id.slice(1));
    let primary = 0;
    switch (sort) {
      case 'tww-asc': primary = a.ordinaryWidth - b.ordinaryWidth; break;
      case 'tww-desc': primary = b.ordinaryWidth - a.ordinaryWidth; break;
      case 'local-asc': primary = (a.localWidth === null) - (b.localWidth === null) || (a.localWidth || 0) - (b.localWidth || 0); break;
      case 'local-desc': primary = (a.localWidth === null) - (b.localWidth === null) || (b.localWidth || 0) - (a.localWidth || 0); break;
      case 'diameter-desc': primary = b.diameter - a.diameter; break;
      case 'diameter-asc': primary = a.diameter - b.diameter; break;
      case 'merge-desc': primary = b.maxMergeDistance - a.maxMergeDistance; break;
      case 'merge-asc': primary = a.maxMergeDistance - b.maxMergeDistance; break;
      case 'core-desc': primary = b.structure.coreOrder - a.structure.coreOrder; break;
      case 'depth-desc': primary = b.structure.longestPendantDepth - a.structure.longestPendantDepth; break;
      case 'remote-late': primary = b.remoteMerges[0].step - a.remoteMerges[0].step; break;
    }
    return primary || defaultOrder;
  }
  const api = {compare};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CandidateCatalogue = api;
})(typeof window === 'undefined' ? globalThis : window);
