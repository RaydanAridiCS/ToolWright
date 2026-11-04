import { Volume2 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "text-to-speech",
  name: "Text-to-Speech",
  tagline: "Hear your text read aloud with any voice in your browser.",
  description:
    "Type or paste text and listen to it with your browser's voices. Adjust speed, pitch and volume, or try the sample. Nothing is uploaded or recorded.",
  category: "text",
  keywords: [
    "text to speech",
    "tts",
    "read text aloud",
    "text reader",
    "speech synthesis",
    "voice reader",
    "online text to speech",
    "free text to speech",
  ],
  icon: Volume2,
  popular: true,
  howTo: [
    "Paste or type the text you want to hear.",
    "Choose a voice and adjust speed, pitch and volume.",
    "Click Speak and listen.",
  ],
  faq: [
    {
      question: "Is my text uploaded or recorded?",
      answer:
        "No. Your text stays in your browser and is read by the Web Speech API built into your device. Nothing is sent to Toolwright or any third party.",
    },
    {
      question: "Why are some voices marked 'network'?",
      answer:
        "Those voices are downloaded by your operating system or browser when needed. Toolwright does not fetch them itself.",
    },
    {
      question: "Can I download the audio?",
      answer:
        "No. This tool is a preview for checking copy. Browsers do not expose the raw audio stream from speech synthesis.",
    },
  ],
  primaryKeyword: "text to speech",
  seoTitle: "Text to Speech Online, Free",
  seoDescription:
    "Listen to text aloud in your browser. Choose a voice, speed, pitch and volume. No upload, no recording, no sign-up.",
  answer:
    "Text-to-Speech reads your text aloud using voices already on your device. Paste or type what you want to hear, pick a voice, and adjust speed, pitch and volume. It runs entirely in your browser, so nothing is uploaded or recorded.",
  nextStep: { slug: "word-counter", text: "Check the length or reading time of your text first." },
  related: ["word-counter", "readability-score", "markdown-preview"],
});
