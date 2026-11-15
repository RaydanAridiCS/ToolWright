import { LockKeyhole } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "protect-pdf",
  name: "Protect PDF with a Password",
  tagline: "Lock a PDF with a password (AES-256), and restrict printing or copying if you like.",
  description:
    "Add a password to a PDF so only people who know it can open the file. It is encrypted with AES-256, the strongest standard PDF encryption. You can also stop printing, copying or editing with an owner password. Runs in your browser; your PDF and password are never uploaded.",
  primaryKeyword: "password protect pdf",
  seoTitle: "Password Protect PDF Free, AES-256, No Upload",
  seoDescription:
    "Lock a PDF with a password using AES-256 encryption, and restrict printing or copying. Your file and password stay in your browser.",
  answer:
    "Protect PDF adds a password to a PDF and encrypts it with AES-256, so the file only opens for people who know the password. You can also stop printing, copying or editing with an owner password. It runs in your browser, so neither the PDF nor the password is uploaded.",
  category: "pdf",
  keywords: ["password protect pdf", "encrypt pdf", "lock pdf", "add password to pdf", "secure pdf", "pdf password", "restrict pdf printing", "aes 256 pdf"],
  icon: LockKeyhole,
  howTo: [
    "Drop one or more PDFs into the box.",
    "Type the password people will need to open the file. To stop printing or copying as well, turn on restrictions and switch off what you want to block.",
    "Download the protected PDF, and keep the password somewhere safe.",
  ],
  faq: [
    { question: "How strong is the encryption?", answer: "It uses AES-256, the strongest encryption the PDF standard offers (revision 6, the one PDF 2.0 uses). With a long password the file cannot be opened without it. A short or common password can be guessed, so use a long one." },
    { question: "Is my password sent anywhere?", answer: "No. The file is encrypted in your browser tab. The password is kept only in the page while you work, never in the address bar, storage or a request." },
    { question: "What if I forget the password?", answer: "Nobody can recover it, including us, because the password is never stored. Keep a copy somewhere safe before you share the file." },
    { question: "Do restrictions on printing and copying really stop people?", answer: "They stop readers that follow the PDF standard, such as Adobe Acrobat and most browsers. They are a request rather than a lock: the content is readable by anyone who can open the file, and some programs ignore the flags. For real secrecy, set a password to open the file." },
    { question: "Which PDF readers open the protected file?", answer: "Any current reader: Adobe Acrobat and Reader 9 or newer, Chrome, Edge, Firefox, Safari and macOS Preview, and the PDF apps on phones. Very old readers from before 2008 cannot open AES-256 files." },
    { question: "Can I protect several PDFs at once?", answer: "Yes. Drop several PDFs and each one gets the same password and restrictions. You download them together as one ZIP." },
  ],
  nextStep: { slug: "unlock-pdf", text: "Need to take a password off a PDF instead? Unlock it." },
  related: ["unlock-pdf", "redact-pdf", "pdf-metadata-editor", "pdf-watermark", "sign-pdf"],
});
