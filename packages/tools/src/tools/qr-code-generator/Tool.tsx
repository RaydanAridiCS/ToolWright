"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Alert, Button, Field, Input, Select, Textarea, Toggle, downloadBlob, useShareableState } from "@toolwright/ui";
import { contrastRatio, parseColor } from "@toolwright/core/color";
import { emailPayload, geoPayload, phonePayload, qrToSvg, smsPayload, vcardPayload, wifiPayload, type ErrorCorrection } from "@toolwright/core/qr";
import { errorMessage } from "../../shared/format";

type Kind = "text" | "wifi" | "vcard" | "email" | "sms" | "phone" | "geo";

const KINDS: { value: Kind; label: string }[] = [
  { value: "text", label: "URL or text" },
  { value: "wifi", label: "Wi-Fi network" },
  { value: "vcard", label: "Contact (vCard)" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "phone", label: "Phone number" },
  { value: "geo", label: "Location" },
];

const INITIAL = {
  kind: "text" as Kind,
  text: "https://toolwright.com",
  ssid: "",
  wifiPassword: "",
  security: "WPA" as "WPA" | "WEP" | "nopass",
  hidden: false,
  firstName: "",
  lastName: "",
  organization: "",
  title: "",
  phone: "",
  email: "",
  website: "",
  subject: "",
  body: "",
  lat: "",
  lng: "",
  ecc: "M" as ErrorCorrection,
  size: 320,
  margin: 4,
  dark: "#1b1a15",
  light: "#ffffff",
  rounded: false,
};

export default function Tool() {
  // The Wi-Fi password is excluded from share links so it never lands in the address bar or browser history.
  const { state, setState } = useShareableState(INITIAL, { exclude: ["wifiPassword"] });
  const set = (patch: Partial<typeof INITIAL>) => setState((s) => ({ ...s, ...patch }));
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const payload = useMemo(() => {
    try {
      switch (state.kind) {
        case "wifi":
          return { ok: true as const, value: wifiPayload({ ssid: state.ssid, password: state.wifiPassword, security: state.security, hidden: state.hidden }) };
        case "vcard":
          return { ok: true as const, value: vcardPayload({ firstName: state.firstName, lastName: state.lastName, organization: state.organization, title: state.title, phone: state.phone, email: state.email, website: state.website }) };
        case "email":
          if (!state.email.trim()) throw new Error("Enter an email address.");
          return { ok: true as const, value: emailPayload({ to: state.email.trim(), subject: state.subject, body: state.body }) };
        case "sms":
          if (!state.phone.trim()) throw new Error("Enter a phone number.");
          return { ok: true as const, value: smsPayload(state.phone.trim(), state.body) };
        case "phone":
          if (!state.phone.trim()) throw new Error("Enter a phone number.");
          return { ok: true as const, value: phonePayload(state.phone.trim()) };
        case "geo": {
          const lat = Number(state.lat);
          const lng = Number(state.lng);
          if (state.lat === "" || state.lng === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Enter a latitude (−90 to 90) and longitude (−180 to 180).");
          return { ok: true as const, value: geoPayload(lat, lng) };
        }
        default:
          if (!state.text.trim()) throw new Error("Enter some text or a link.");
          return { ok: true as const, value: state.text };
      }
    } catch (err) {
      return { ok: false as const, error: errorMessage(err) };
    }
  }, [state]);

  const svg = useMemo(() => {
    if (!payload.ok) return null;
    try {
      return { ok: true as const, markup: qrToSvg(payload.value, { ecc: state.ecc, margin: state.margin, dark: state.dark, light: state.light, rounded: state.rounded, size: state.size }) };
    } catch (err) {
      return { ok: false as const, error: errorMessage(err, "This content is too long for a QR code.") };
    }
  }, [payload, state.ecc, state.margin, state.dark, state.light, state.rounded, state.size]);

  const dark = parseColor(state.dark);
  const light = parseColor(state.light);
  const lowContrast = Boolean(dark && light && (contrastRatio(dark, light) < 3 || luminanceInverted(dark, light)));

  const downloadPng = async () => {
    if (!svg?.ok) return;
    setDownloadError(null);
    try {
      const url = URL.createObjectURL(new Blob([svg.markup], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("The QR code could not be rendered."));
        img.src = url;
      });
      const scale = Math.max(1, Math.round(1024 / state.size));
      const canvas = document.createElement("canvas");
      canvas.width = state.size * scale;
      canvas.height = state.size * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG export failed.");
      downloadBlob(blob, "qr-code.png");
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  };

  const text = (key: keyof typeof INITIAL, label: string, props: { placeholder?: string; type?: string } = {}) => (
    <Field label={label}>
      {(id) => <Input id={id} value={String(state[key])} onChange={(e) => set({ [key]: e.target.value } as Partial<typeof INITIAL>)} {...props} />}
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-5">
        <Field label="What should the QR code contain?">
          {(id) => (
            <Select id={id} value={state.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          {state.kind === "text" && (
            <Field label="URL or text" className="sm:col-span-2">
              {(id) => <Textarea id={id} mono={false} rows={4} value={state.text} onChange={(e) => set({ text: e.target.value })} placeholder="https://example.com" />}
            </Field>
          )}
          {state.kind === "wifi" && (
            <>
              {text("ssid", "Network name (SSID)")}
              {text("wifiPassword", "Password")}
              <Field label="Security">
                {(id) => (
                  <Select id={id} value={state.security} onChange={(e) => set({ security: e.target.value as "WPA" | "WEP" | "nopass" })}>
                    <option value="WPA">WPA / WPA2 / WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">No password</option>
                  </Select>
                )}
              </Field>
              <Toggle label="Hidden network" checked={state.hidden} onCheckedChange={(hidden) => set({ hidden })} />
            </>
          )}
          {state.kind === "vcard" && (
            <>
              {text("firstName", "First name")}
              {text("lastName", "Last name")}
              {text("organization", "Organization")}
              {text("title", "Job title")}
              {text("phone", "Phone")}
              {text("email", "Email")}
              {text("website", "Website")}
            </>
          )}
          {state.kind === "email" && (
            <>
              {text("email", "To")}
              {text("subject", "Subject")}
              <Field label="Message" className="sm:col-span-2">
                {(id) => <Textarea id={id} mono={false} rows={3} value={state.body} onChange={(e) => set({ body: e.target.value })} />}
              </Field>
            </>
          )}
          {state.kind === "sms" && (
            <>
              {text("phone", "Phone number", { placeholder: "+15551234567" })}
              {text("body", "Message")}
            </>
          )}
          {state.kind === "phone" && text("phone", "Phone number", { placeholder: "+15551234567" })}
          {state.kind === "geo" && (
            <>
              {text("lat", "Latitude", { placeholder: "51.5007" })}
              {text("lng", "Longitude", { placeholder: "-0.1246" })}
            </>
          )}
        </div>

        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2" role="group" aria-label="Appearance">
          <Field label="Error correction" hint="Higher survives more damage but looks denser.">
            {(id) => (
              <Select id={id} value={state.ecc} onChange={(e) => set({ ecc: e.target.value as ErrorCorrection })}>
                <option value="L">Low (7%)</option>
                <option value="M">Medium (15%)</option>
                <option value="Q">Quartile (25%)</option>
                <option value="H">High (30%)</option>
              </Select>
            )}
          </Field>
          <Field label={`Size: ${state.size}px`}>
            {(id) => <input id={id} type="range" min={128} max={640} step={16} value={state.size} onChange={(e) => set({ size: Number(e.target.value) })} className="accent-primary" />}
          </Field>
          <Field label="Foreground">
            {(id) => <input id={id} type="color" value={state.dark} onChange={(e) => set({ dark: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />}
          </Field>
          <Field label="Background">
            {(id) => <input id={id} type="color" value={state.light} onChange={(e) => set({ light: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />}
          </Field>
          <Field label={`Quiet zone: ${state.margin} modules`}>
            {(id) => <input id={id} type="range" min={0} max={8} value={state.margin} onChange={(e) => set({ margin: Number(e.target.value) })} className="accent-primary" />}
          </Field>
          <Toggle label="Rounded dots" checked={state.rounded} onCheckedChange={(rounded) => set({ rounded })} />
        </div>
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-4" aria-label="QR code preview">
          {svg?.ok ? (
            <div className="max-w-full [&>svg]:h-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg.markup }} role="img" aria-label="Generated QR code" />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Your QR code appears here.</p>
          )}
        </div>
        {!payload.ok ? <Alert tone="info">{payload.error}</Alert> : null}
        {svg && !svg.ok ? <Alert tone="error">{svg.error}</Alert> : null}
        {lowContrast ? <Alert tone="warning">Low contrast, or a light foreground on a dark background, can make the code hard to scan. Dark on light works best.</Alert> : null}
        {downloadError ? <Alert tone="error">{downloadError}</Alert> : null}
        <div className="flex gap-2">
          <Button className="flex-1" variant="primary" disabled={!svg?.ok} onClick={() => svg?.ok && downloadBlob(svg.markup, "qr-code.svg", "image/svg+xml")}>
            <Download /> SVG
          </Button>
          <Button className="flex-1" variant="outline" disabled={!svg?.ok} onClick={downloadPng}>
            <Download /> PNG
          </Button>
        </div>
      </aside>
    </div>
  );
}

/** Scanners expect dark modules on a light background. */
function luminanceInverted(dark: NonNullable<ReturnType<typeof parseColor>>, light: NonNullable<ReturnType<typeof parseColor>>): boolean {
  const l = (c: typeof dark) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return l(dark) > l(light);
}
