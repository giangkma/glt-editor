/**
 * Hoàn thiện video sau khi dựng + mix:
 *  - CÂU MÓC (cold open): chép đoạn [s, e] (đã có phụ đề + nhạc) lên ĐẦU video, cắt thẳng vào video từ đầu.
 *  - ĐOẠN KẾT CTA: khung cuối đứng hình, làm mờ + tối, lớp chữ/logo thương hiệu hiện dần (hoà tan từ video sang),
 *    tiếng nhỏ dần.
 * 1 lần mã hoá duy nhất.
 */
import { probe, runCommand, ffmpeg } from "../editor/ffmpeg.js";
import { videoEncoderOptions } from "../editor/filterGraph.js";
import { config } from "../../config.js";

/**
 * @param {object} p
 * @param {{s:number,e:number}|null} p.hook
 * @param {{overlay:string,duration:number,darken:number}|null} p.cta
 */
export async function finishVideo({ input, output, hook, cta, signal, onProgress }) {
  const info = await probe(input);
  const fps = Math.round(info.fps || 30);
  const W = info.width;
  const H = info.height;
  const T = info.videoDuration || info.duration; // theo luồng hình (tiếng mix thường dài hơn chút)
  const norm = `fps=${fps},scale=${W}:${H},setsar=1,format=yuv420p`;
  const g = [];
  const useHook = hook && hook.e - hook.s >= 0.8 && hook.e <= T;
  const hd = useHook ? hook.e - hook.s : 0;

  g.push(`[0:v]split=${useHook ? 3 : 2}[vm][vl]${useHook ? "[vh]" : ""}`);
  g.push(`[0:a]${useHook ? "asplit=2[am][ah]" : "anull[am]"}`);

  let vMain = "vm";
  let aMain = "am";
  if (useHook) {
    g.push(`[vh]trim=${hook.s.toFixed(3)}:${hook.e.toFixed(3)},setpts=PTS-STARTPTS,${norm}[hv]`);
    g.push(`[ah]atrim=${hook.s.toFixed(3)}:${hook.e.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, hd - 0.12).toFixed(3)}:d=0.12[ha]`);
    g.push(`[vm]${norm}[vm2];[am]afade=t=in:d=0.06[am2]`);
    g.push(`[hv][ha][vm2][am2]concat=n=2:v=1:a=1[vj][aj]`);
    vMain = "vj";
    aMain = "aj";
  } else {
    g.push(`[vm]${norm}[vm2]`);
    vMain = "vm2";
  }
  const total = hd + T;

  if (cta) {
    const D = cta.duration;
    const X = 0.35; // hoà tan video → đoạn kết
    const dark = Math.min(0.85, Math.max(0, cta.darken ?? 0.5));
    // Nền đoạn kết: khung cuối đứng hình, mờ + tối
    g.push(
      `[vl]trim=start=${Math.max(0, T - 0.1).toFixed(3)},setpts=PTS-STARTPTS,${norm},tpad=stop_mode=clone:stop_duration=${(D + 0.2).toFixed(2)},` +
        `trim=duration=${D.toFixed(3)},setpts=PTS-STARTPTS,gblur=sigma=${Math.round(W / 40)},eq=brightness=${(-dark * 0.35).toFixed(3)}:saturation=0.85[cbg]`,
    );
    // Giữ tỉ lệ thiết kế (đoạn kết thiết kế dọc 9:16 đặt giữa video ngang, không bị kéo méo)
    g.push(`[1:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,fade=t=in:st=${(X * 0.6).toFixed(2)}:d=0.35:alpha=1[cov]`);
    g.push(`[cbg][cov]overlay=(W-w)/2:(H-h)/2:shortest=1,${norm}[cv]`);
    g.push(`[${vMain}]settb=AVTB[xa];[cv]settb=AVTB[xb]`);
    g.push(`[xa][xb]xfade=transition=fade:duration=${X}:offset=${(total - X).toFixed(3)}[vo]`);
    g.push(`[${aMain}]afade=t=out:st=${Math.max(0, total - 0.5).toFixed(3)}:d=${(0.5 + D * 0.5).toFixed(2)},apad=pad_dur=${D.toFixed(2)},atrim=0:${(total - X + D).toFixed(3)}[ao]`);
  } else {
    g.push(`[${vMain}]null[vo]`);
    g.push(`[${aMain}]anull[ao]`);
  }
  // [vl] chưa dùng khi không có CTA → bỏ đi
  if (!cta) g.push(`[vl]nullsink`);

  const cmd = ffmpeg(input);
  if (cta) cmd.input(cta.overlay).inputOptions(["-loop", "1", "-framerate", String(fps), "-t", String(cta.duration + 0.5)]);
  cmd
    .complexFilter(g.join(";"), ["vo", "ao"])
    .outputOptions([
      ...videoEncoderOptions({ ...config.edit, encoder: config.edit.videoEncoder, fps }),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
    ])
    .output(output);
  await runCommand(cmd, { signal, expectedDuration: total + (cta?.duration ?? 0), onProgress, label: "hoan-thien" });
  return { hook: useHook ? hd : 0, cta: cta ? cta.duration : 0 };
}
