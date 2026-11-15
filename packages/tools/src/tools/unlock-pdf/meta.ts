import { LockKeyholeOpen } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "unlock-pdf",
  name: "Unlock PDF",
  tagline: "Remove the password from a PDF you can open, or lift its print and copy restrictions.",
  description:
    "Take the password off a PDF so it opens without one: type the password once and download an unlocked copy. Files that open freely but block printing or copying are unlocked without asking. Works with RC4 and AES encryption. Runs in your browser; nothing is uploaded.",
  primaryKeyword: "unlock pdf",
  seoTitle: "Unlock PDF, Remove Password Free, No Upload",
  seoDescription:
    "Remove the password from a PDF you can open, or lift print and copy restrictions. Works with RC4 and AES. Runs in your browser; nothing is uploaded.",
  answer:
    "Unlock PDF removes the password from a PDF when you know it, and lifts print, copy and edit restrictions from files that open without one. It handles RC4 and AES-128 or AES-256 encryption and runs in your browser, so the file and password are never uploaded.",
  category: "pdf",
  keywords: ["unlock pdf", "remove pdf password", "pdf password remover", "decrypt pdf", "remove pdf restrictions", "unlock secured pdf", "enable printing pdf", "pdf unlocker"],
  icon: LockKeyholeOpen,
  howTo: [
    "Drop one or more protected PDFs into the box. The tool says how each one is protected.",
    "If a file needs a password to open, type it. Files that only restrict printing or copying need nothing.",
    "Download the unlocked PDF. It opens without a password and has no restrictions.",
  ],
  faq: [
    { question: "Can it open a PDF if I do not know the password?", answer: "No. A PDF that needs a password to open is encrypted with it, and this tool does not guess passwords. You need the password (the one to open the file, or the owner password)." },
    { question: "Why could I open the file but not print or copy from it?", answer: "The file has an owner password that sets restrictions but no password to open it. Readers can open it, so the tool can too, and it saves a copy without the restrictions. Only do this with files you are allowed to change." },
    { question: "Is my password sent anywhere?", answer: "No. The file is decrypted in your browser tab, and the password is never put in the address bar, stored or sent." },
    { question: "Which kinds of protection does it handle?", answer: "The standard PDF password protection in every version: RC4 40-bit and 128-bit, AES-128 and AES-256. Files protected with a certificate or a company rights-management plug-in cannot be opened in a browser and are refused with a message." },
    { question: "Does the unlocked file lose anything?", answer: "No. The pages, text, links, bookmarks, form fields and properties are kept. A digital signature on the file stops being valid, because any change to a signed PDF breaks it." },
    { question: "Can I unlock several PDFs at once?", answer: "Yes, if they share a password or need none. Drop them together and download one ZIP." },
  ],
  nextStep: { slug: "protect-pdf", text: "Want to set a new password? Protect the PDF again." },
  related: ["protect-pdf", "pdf-metadata-editor", "compress-pdf", "merge-pdf", "pdf-to-text"],
});
