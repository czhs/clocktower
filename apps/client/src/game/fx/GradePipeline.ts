// Fixed-camera art carries shading, bloom halos and foreground softness.
// This is one texture sample and one color-grade pass: no blur targets or bloom chain.
import * as Phaser from 'phaser';
import type { Grade } from './grades';
const FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uAspect;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadow;
uniform vec3 uHi;
uniform float uSplit;
uniform float uCoolDesat;
uniform float uVig;
uniform vec3 uVigColor;
varying vec2 outTexCoord;
void main() {
  vec4 src = texture2D(uMainSampler, outTexCoord);
  vec3 c = uGain * (src.rgb + uLift * (1.0 - src.rgb));
  c = pow(max(c, vec3(0.0)), 1.0 / uGamma);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(1.0), uShadow, (1.0 - smoothstep(0.0, 0.5, l)) * uSplit);
  c *= mix(vec3(1.0), uHi, smoothstep(0.35, 0.95, l) * uSplit);
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  float cool = clamp((c.b - c.r) * 3.0, 0.0, 1.0);
  c = mix(c, vec3(l) * vec3(0.94, 0.98, 1.06), cool * uCoolDesat);
  c = (c - 0.5) * uContrast + 0.5;
  float v = smoothstep(0.38, 0.95, length((outTexCoord - 0.5) * uAspect));
  c = mix(c, uVigColor, v * v * uVig);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;
export const GRADE_PIPELINE = 'ctGrade';
export class GradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  grade: Grade | null = null;
  constructor(game: Phaser.Game) {
    super({ game, name: GRADE_PIPELINE, fragShader: FRAGMENT, renderTarget: true });
  }
  override onDraw(target: Phaser.Renderer.WebGL.RenderTarget) {
    const g = this.grade;
    if (g) {
      this.set2f('uAspect', target.width / Math.max(1, target.height), 1);
      for (const [name, v] of [
        ['uLift', g.lift], ['uGamma', g.gamma], ['uGain', g.gain],
        ['uShadow', g.shadow], ['uHi', g.hi], ['uVigColor', g.vigColor],
      ] as const) this.set3f(name, v[0], v[1], v[2]);
      this.set1f('uSat', g.sat);
      this.set1f('uContrast', g.contrast);
      this.set1f('uSplit', g.split);
      this.set1f('uCoolDesat', g.coolDesat);
      this.set1f('uVig', g.vig);
    }
    this.bindAndDraw(target);
  }
}
