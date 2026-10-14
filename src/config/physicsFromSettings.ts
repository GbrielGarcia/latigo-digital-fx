import { resolveParams, type WhipParams } from '../core/whip/params';
import type { Settings } from './settings';

/** Physical whip parameters for the user's settings (shared by both windows). */
export function paramsFromSettings(s: Settings): WhipParams {
  return resolveParams({
    length: s.length,
    nodeCount: s.nodeCount,
    force: s.force,
    flexibility: s.flexibility,
    damping: s.damping,
    sensitivity: s.sensitivity,
    quality: s.quality,
  });
}
