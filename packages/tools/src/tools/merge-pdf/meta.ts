import { Merge } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "merge-pdf",
  name: "Merge PDF",
  tagline: "Combine PDFs into one: whole files or chosen pages, in any order, with a bookmark per file.",
  description:
    "Merge multiple PDFs into a single document. Drag files into order, take only the pages you need from each, or arrange single pages across files with previews. The merged file gets a bookmark per file, keeps each file's own bookmarks and keeps forms fillable. Everything runs in your browser: nothing is uploaded, and there are no page limits or watermarks.",
  primaryKeyword: "merge pdf",
  seoTitle: "Merge PDF Files Online Free, No Upload",
  seoDescription:
    "Combine several PDFs into one in your browser. Reorder files, no upload, no sign-up, no watermark. Your documents stay on your device.",
  answer:
    "Merge PDF combines several PDF files into one document in your browser: whole files or chosen pages, in any order, with a bookmark for each file and forms kept fillable. Nothing is uploaded, and there is no sign-up and no watermark.",
  category: "pdf",
  keywords: ["merge pdf", "combine pdf", "join pdf", "pdf merger", "append pdf", "free pdf merge no upload"],
  icon: Merge,
  popular: true,
  howTo: [
    "Add two or more PDF files.",
    "Drag the files into order. To take only some pages of a file, type them in its Pages box, such as 1-3, 5.",
    "To mix pages across files, switch to Single pages and drag pages anywhere, turn them or remove them.",
    "Click Merge and download the combined PDF.",
  ],
  faq: [
    { question: "Are my PDFs uploaded to a server?", answer: "No. Merging runs in your browser with pdf-lib. You can disconnect from the internet after the page loads and it still works." },
    { question: "Is there a size or page limit?", answer: "There is no limit imposed by Toolwright; the practical limit is your device's memory. Merging a few hundred megabytes is usually fine on a modern computer." },
    { question: "Can I merge only some pages of each PDF?", answer: "Yes. Type the pages in a file's Pages box, such as 1-3, 7 or 5-, in the order you want them. Or switch to Single pages to put any page of any file anywhere." },
    { question: "Are bookmarks kept?", answer: "Yes. Each file's own bookmarks are kept, and by default each file also gets a bookmark named after it, with its bookmarks inside, so the merged document is easy to find your way around." },
    { question: "Do fillable forms still work after merging?", answer: "Yes. Form fields are kept fillable. If two files have a field with the same name, the second one is renamed (name becomes name_2) so filling one does not fill the other." },
    { question: "How do I make every document start on a new sheet when printing double-sided?", answer: "Turn on “Start each file on a right-hand page”. A blank page is added after any file that ends on a left-hand page." },
  ],
  nextStep: { slug: "compress-pdf", text: "Merged file too large to email? Compress the PDF." },
  related: ["split-pdf", "extract-pdf-pages", "images-to-pdf", "rotate-pdf", "compress-pdf", "sign-pdf"],
});
