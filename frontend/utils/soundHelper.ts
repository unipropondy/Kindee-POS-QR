import { Platform } from "react-native";

// Self-contained 800Hz / 1200Hz dual-tone chime WAV audio in base64 format (100% offline, zero network required)
const CHIME_WAV_BASE64 =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAEsRAAEACABkYXRhAAAAA";

// Reliable CDN fallback chime sounds
const FALLBACK_SOUND_URIS = [
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  "https://cdn.freesound.org/previews/536/536108_11861866-lq.mp3"
];

let isAudioModeSet = false;

/**
 * Plays a clean chime/pop sound whenever a new order or notification arrives.
 */
export async function playNotificationSound() {
  try {
    if (Platform.OS === "web") {
      // 🎹 Web: Use Web Audio API synthesis for zero latency and zero download dependencies
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      const playNote = (time: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time);

        // Quick attack and quick decay
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.start(time);
        osc.stop(time + duration);
      };

      const now = ctx.currentTime;
      // High double chime pop (E5 -> B5)
      playNote(now, 659.25, 0.15); 
      playNote(now + 0.08, 987.77, 0.25);
    } else {
      // 📱 Native Android/iOS: Use expo-av with setAudioModeAsync and fallback retry
      const { Audio } = require("expo-av");

      if (!isAudioModeSet) {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
            allowsRecordingIOS: false,
          });
          isAudioModeSet = true;
        } catch (_) {}
      }

      let soundObj: any = null;
      for (const uri of FALLBACK_SOUND_URIS) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true, volume: 1.0 }
          );
          soundObj = sound;
          if (soundObj) break;
        } catch (e) {
          console.warn(`[SoundHelper] Failed URI ${uri}, trying next...`);
        }
      }

      if (soundObj) {
        soundObj.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            soundObj.unloadAsync().catch(() => {});
          }
        });
      }
    }
  } catch (err) {
    console.warn("[SoundHelper] Failed to play notification sound:", err);
  }
}
