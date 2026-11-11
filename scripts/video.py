"""AI Music Studio promo video (1920x1080, 30 fps): title, every screenshot with a short English caption, outro.
Music: track.wav (afro / deep house, 120 BPM). Output: AI-Music-Studio-Promo.mp4"""
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
REPO = '/home/user/ai-music-studio/docs/screenshots/'
NEW = '/tmp/claude-0/vid/'
LOGO = '/home/user/ai-music-studio/apps/desktop/src/renderer/src/assets/logo.png'
F = '/usr/share/fonts/opentype/inter/'
font = lambda w, s: ImageFont.truetype(F + {'b': 'Inter-Bold.otf', 'x': 'Inter-ExtraBold.otf', 'm': 'Inter-Medium.otf', 'r': 'Inter-Regular.otf'}[w], s)
ACC = (139, 92, 246)

SLIDES = [
    (NEW + 'create.png', 'Create music', 'Describe a style, add lyrics, pick a model: songs with vocals, made on your own PC.'),
    (NEW + 'loop.png', 'Create loop', 'Exactly 1 to 16 bars, starts on beat 1 and repeats seamlessly. Named like "Loop 124 BPM 4 bars".'),
    (NEW + 'studio.png', 'Studio', 'A real DAW: loop and markers, automation, tempo track, takes, warp markers, return tracks, groups.'),
    (NEW + 'piano-roll.png', 'Piano Roll', 'Draw, move and quantize MIDI notes.'),
    (NEW + 'mixer.png', 'Mixer', 'Faders, pan, mute and solo, live level meters and the master.'),
    (NEW + 'library.png', 'Library', 'Every song and loop is kept with its tempo and tags. Search by name, tag or BPM.'),
    (NEW + 'stems.png', 'Stems in the Library', 'Saved per song, tagged and ready for any DAW.'),
    (NEW + 'export.png', 'Export for any DAW', 'WAV 16 / 24 / 32-bit, AIFF, FLAC or MP3: every stem as its own file.'),
    (NEW + 'stem-splitter.png', 'Stem Splitter', 'Vocals, drums, bass, piano, guitar and more, separated with Demucs.'),
    (NEW + 'mastering.png', 'Mastering', 'Match your mix to a reference track.'),
    (REPO + 'ai-chat.png', 'AI Chat', 'A music assistant for chords, lyrics and ideas.'),
    (NEW + 'settings-ai.png', 'AI assistant of your choice', 'Claude, ChatGPT, Grok, or completely free and local with Ollama.'),
    (NEW + 'settings-ai-engines.png', 'AI Engines', 'One click installs ACE-Step 1.5, MusicGen, DiffRhythm, Demucs and more.'),
    (NEW + 'settings-hardware.png', 'Hardware check', 'See what your PC can run, and how fast: CPU, NVIDIA, AMD and Intel graphics.'),
    (REPO + 'settings-models.png', 'Models', 'Downloaded models, their size and your models folder.'),
    (NEW + 'settings-shortcuts.png', 'Shortcuts', 'Work with the Ableton Live 12 or the Cubase key layout.'),
    (REPO + 'settings-general.png', 'General settings', 'Language and VST plugin folders.'),
    (REPO + 'settings-audio.png', 'Audio settings', 'Sample rate and buffer size.'),
    (REPO + 'settings-appearance.png', 'Appearance', 'Dark or light theme.'),
    (REPO + 'settings-updates.png', 'Automatic updates', 'New versions arrive by themselves, with one click.'),
    (NEW + 'settings-about.png', 'Free and open source', 'GPL-3.0, no account, no subscription. Give it a star on GitHub!'),
    (REPO + 'vocal-editor.png', 'Coming soon: Vocal Editor', 'AI singing from notes and lyrics.'),
    (REPO + 'instruments.png', 'Coming soon: AI Instruments', 'AI instruments for your MIDI tracks.'),
    (REPO + 'karaoke.png', 'Coming soon: Karaoke Export', 'Word timing, .lrc files and lyric videos.'),
    (REPO + 'video-composer.png', 'Coming soon: Video Composer', 'Music that follows the cuts of your video.'),
]
T_TITLE, T_SLIDE, T_OUTRO, XF = 6.0, 4.6, 11.0, 0.45

BOX = (110, 70, 1700, 806)        # x, y, w, h of the screenshot window (aspect ~2.11 fits 16:10 and 16:9 crops)


def background():
    y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
    r = 14 + 22 * (1 - y) * x; g = 10 + 8 * (1 - y); b = 26 + 40 * (1 - y) * (1 - x * 0.5)
    img = np.stack([r + 0 * x, g + 0 * x, b + 0 * x], 2)
    glow = np.exp(-(((x - 0.8) ** 2) / 0.05 + ((y - 0.15) ** 2) / 0.05)) * 60
    img[..., 0] += glow * 0.55; img[..., 2] += glow
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


BG = background()
logo = Image.open(LOGO).convert('RGBA')


def wrap(draw, text, fnt, width):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if draw.textlength(t, font=fnt) <= width:
            cur = t
        else:
            lines.append(cur); cur = w_
    lines.append(cur)
    return lines


def slide_base(i, title, desc):
    """Background, window frame, caption and corner badge; the screenshot is pasted per frame."""
    img = BG.copy()
    d = ImageDraw.Draw(img)
    x, y, w, h = BOX
    sh = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((40, 50, w + 40, h + 40), 22, fill=(0, 0, 0, 170))
    img.paste(sh.filter(ImageFilter.GaussianBlur(18)), (x - 40, y - 40), sh.filter(ImageFilter.GaussianBlur(18)))
    d.rounded_rectangle((x - 3, y - 3, x + w + 3, y + h + 3), 18, outline=(*ACC, 255), width=3)
    # caption
    cy = y + h + 26
    d.text((x, cy), title, font=font('x', 46), fill=(255, 255, 255))
    tw = d.textlength(title, font=font('x', 46))
    lines = wrap(d, desc, font('m', 28), w - tw - 60)
    for k, ln in enumerate(lines[:2]):
        d.text((x + tw + 34, cy + 4 + k * 34), ln, font=font('m', 28), fill=(205, 198, 230))
    # badge
    small = logo.resize((54, 54))
    img.paste(small, (W - 300, 14), small)
    d.text((W - 236, 26), 'AI Music Studio', font=font('b', 26), fill=(255, 255, 255))
    d.text((W - 60, H - 46), f'{i + 1}/{len(SLIDES)}', font=font('m', 20), fill=(150, 140, 190), anchor='ra')
    return img


def fit_shot(path):
    """The screenshot scaled to cover the box, plus some margin for the slow zoom."""
    im = Image.open(path).convert('RGB')
    x, y, w, h = BOX
    s = max(w / im.width, h / im.height) * 1.08
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)


def mask_rounded(w, h, r=16):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    return m


MASK = mask_rounded(BOX[2], BOX[3])


def frame_for(base, shot, u):
    """u in 0..1 through the slide: slow zoom out from 1.08 to 1.0, drifting from the top left."""
    x, y, w, h = BOX
    z = 1.08 - 0.08 * u
    # crop size in the scaled shot: at z = 1.08 the box shows w x h pixels of it, at z = 1.0 a bit more
    cw = min(shot.width, int(w * 1.08 / z)); ch = min(shot.height, int(h * 1.08 / z))
    ox = int((shot.width - cw) * (0.15 + 0.2 * u)); oy = int((shot.height - ch) * (0.1 + 0.1 * u))
    crop = shot.crop((ox, oy, ox + cw, oy + ch)).resize((w, h), Image.BILINEAR)
    out = base.copy()
    out.paste(crop, (x, y), MASK)
    return out


def title_card(u):
    img = BG.copy(); d = ImageDraw.Draw(img)
    a = min(1, u * 2.5)
    big = logo.resize((260, 260))
    img.paste(big, (W // 2 - 130, 170), big)
    d.text((W // 2, 470), 'AI Music Studio', font=font('x', 108), fill=(255, 255, 255), anchor='ma')
    d.text((W // 2, 610), 'Free, open-source music studio for Windows', font=font('b', 46), fill=(220, 210, 250), anchor='ma')
    d.text((W // 2, 685), '100 % local AI  ·  songs with vocals  ·  seamless loops  ·  a full DAW', font=font('m', 36), fill=(*ACC,), anchor='ma')
    d.text((W // 2, 900), 'Music in this video: afro house, 120 BPM', font=font('r', 24), fill=(150, 140, 190), anchor='ma')
    if a < 1:
        img = Image.blend(Image.new('RGB', (W, H)), img, a)
    return img


def outro_card(u):
    img = BG.copy(); d = ImageDraw.Draw(img)
    big = logo.resize((200, 200))
    img.paste(big, (W // 2 - 100, 110), big)
    d.text((W // 2, 345), 'Download free', font=font('x', 96), fill=(255, 255, 255), anchor='ma')
    d.text((W // 2, 480), 'github.com/pierrecinema/ai-music-studio', font=font('b', 54), fill=(*ACC,), anchor='ma')
    lines = ['Windows installer  ·  automatic updates  ·  no account, no subscription',
             'Beta testers wanted, especially with NVIDIA graphics cards',
             'Like it? Leave a star on GitHub and subscribe for updates']
    for k, ln in enumerate(lines):
        d.text((W // 2, 600 + k * 62), ln, font=font('m', 38), fill=(225, 218, 250), anchor='ma')
    fade = max(0, (u - 0.8) / 0.2)
    if fade > 0:
        img = Image.blend(img, Image.new('RGB', (W, H)), fade)
    return img


def main():
    segs = [('title', T_TITLE, None)] + [('slide', T_SLIDE, s) for s in SLIDES] + [('outro', T_OUTRO, None)]
    total = sum(s[1] for s in segs)
    prepared = []
    for kind, dur, s in segs:
        if kind == 'slide':
            i = SLIDES.index(s)
            prepared.append((kind, dur, slide_base(i, s[1], s[2]), fit_shot(s[0])))
        else:
            prepared.append((kind, dur, None, None))
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-i', '/tmp/claude-0/vid/track.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart',
                           '/tmp/claude-0/vid/AI-Music-Studio-Promo.mp4'], stdin=subprocess.PIPE)

    def render(seg, t):
        kind, dur, base, shot = seg
        u = min(1.0, max(0.0, t / dur))
        if kind == 'title': return title_card(u)
        if kind == 'outro': return outro_card(u)
        return frame_for(base, shot, u)

    starts = np.cumsum([0] + [p[1] for p in prepared])
    n = int(total * FPS)
    for f in range(n):
        t = f / FPS
        k = int(np.searchsorted(starts, t, side='right') - 1)
        k = min(k, len(prepared) - 1)
        img = render(prepared[k], t - starts[k])
        # crossfade into the next segment during its first XF seconds
        if k > 0 and t - starts[k] < XF:
            prev = render(prepared[k - 1], t - starts[k - 1])
            img = Image.blend(prev, img, (t - starts[k]) / XF)
        ff.stdin.write(img.tobytes())
        if f % 300 == 0:
            print(f'{t:.0f}/{total:.0f} s', flush=True)
    ff.stdin.close(); ff.wait()
    print('done', total)


if __name__ == '__main__':
    main()
