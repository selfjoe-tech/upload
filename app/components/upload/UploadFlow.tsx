// app/components/upload/UploadFlow.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, X as XIcon, Search, Loader } from "lucide-react";
import type { AudienceType } from "@/lib/actions/media";
import { startTransition, useState } from "react";
import {
  ensureTagAction,
  fetchInitialTagSuggestions,
  searchTagSuggestions,
} from "@/lib/actions/tags";
import { slugify } from "@/lib/utils/text";

export type ClipSelection = {
  start: number;
  end: number;
  muted: boolean;
  file: File;
};

export type ImageSelection = {
  files: File[]; // ordered files
  order: number[]; // original indices in chosen order
  coverIndex: number; // index inside ordered array
  urls?: string[];
};

export type UploadFlowSubmitPayload = {
  audience: AudienceType;
  tags: string[];
  description: string;
  kind: "video" | "images";
  clip?: ClipSelection;
  images?: ImageSelection;
};

type BaseHandlers = {
  onCancel: () => void;
  onSubmit: (payload: UploadFlowSubmitPayload) => Promise<void>;
};

type Props =
  | ({ variant: "video"; clip: ClipSelection } & BaseHandlers)
  | ({ variant: "images"; images: ImageSelection } & BaseHandlers);

const ACCENT = "pink";

// Must match audience_type enum
const AUDIENCES: AudienceType[] = [
  "straight",
  "gay",
  "trans",
  "bisexual",
  "lesbian",
  "animated",
];

// Fallback suggestions if DB fails / is empty.
const FALLBACK_SUGGESTED = ["Trending", "POV", ];

// ---- small helper to Title Case any string --------------------------
function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function Stepper({ step, total = 3 }: { step: number; total?: number }) {
  const pct = (step - 1) / (total - 1);
  return (
    <div className="w-full">
      <div className="h-0.5 bg-white/15 rounded-full relative">
        <div
          className="h-0.5 rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: ACCENT }}
        />
        <div
          className="absolute -top-[5px] h-3 w-3 rounded-full"
          style={{
            left: `calc(${pct * 100}% - 6px)`,
            backgroundColor: ACCENT,
          }}
        />
      </div>
    </div>
  );
}

export default function UploadFlow(props: Props) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [audience, setAudience] = React.useState<AudienceType>(AUDIENCES[0]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);




  // NEW: suggestions that come from DB (with fallback default)
  const [suggestions, setSuggestions] =
    React.useState<string[]>(FALLBACK_SUGGESTED);

  // ======= INITIAL SUGGESTIONS (first 50 tags) =======================
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const initial = await fetchInitialTagSuggestions(50);
        if (!cancelled && initial.length > 0) {
          setSuggestions(initial);
        }
      } catch (err) {
        console.error("initial tag suggestions error", err);
        // keep fallback suggestions if error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ======= DEBOUNCED SEARCH WHEN USER TYPES ==========================
  React.useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    const timer = window.setTimeout(async () => {
      try {
        // empty → go back to normal 50 tags
        const results = await (q
          ? searchTagSuggestions(q, 50)
          : fetchInitialTagSuggestions(50));

        if (!cancelled && results.length > 0) {
          setSuggestions(results);
        } else if (!cancelled && !q && results.length === 0) {
          // no tags at all in DB? keep fallback
          setSuggestions(FALLBACK_SUGGESTED);
        }
      } catch (err) {
        console.error("tag search error", err);
        // on error, we silently keep current suggestions
      }
    }, 300); // 300ms debounce

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // Filter to max 30 and still apply a simple substring filter client-side
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = suggestions;
    if (!q) return base.slice(0, 30);
    return base.filter((t) => t.toLowerCase().includes(q)).slice(0, 30);
  }, [query, suggestions]);

  const addTag = (t: string) => {
  const v = t.trim();
  if (!v) return;

  const label = toTitleCase(v);
  if (tags.includes(label) || tags.length >= 10) return;

  // optimistic UI
  setTags((p) => [...p, label]);
  setQuery("");

  startTransition(async () => {
    const res = await ensureTagAction({ label, slug: slugify(label) });
    if (!res.success) {
      console.error("ensureTagAction failed:", res.message);
      
    }
  });
};

  const removeTag = (t: string) =>
    setTags((p) => p.filter((x) => x !== t));

  const canNextFromTags = tags.length >= 3 && tags.length <= 10;

  const submit = async () => {
  setSubmitError(null);
  setLoading(true);

  try {
    if (props.variant === "video") {
      await props.onSubmit({
        audience,
        tags,
        description,
        kind: "video",
        clip: props.clip,
      });
    } else {
      await props.onSubmit({
        audience,
        tags,
        description,
        kind: "images",
        images: props.images,
      });
    }
  } catch (err: any) {
    console.error("UploadFlow submit error", err);
    setSubmitError(err?.message ?? "Something went wrong while uploading.");
  } finally {
    setLoading(false);
  }
};


  const titleForStep =
    step === 1
      ? "Choose main audience"
      : step === 2
      ? "Add Tags"
      : "Description";

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 space-y-6 mb-20">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Upload Content</h1>
        <Stepper step={step} />
      </div>

      <div className="rounded-2xl bg-[#121212] border border-white/10">
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          <button
            onClick={() =>
              step === 1
                ? props.onCancel()
                : setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
            }
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-semibold text-lg">{titleForStep}</p>
        </div>

        <div className="p-5 sm:p-6">
          {/* STEP 1 – audience */}
          {step === 1 && (
            <div className="space-y-6">
              <p className="text-sm text-white/80">
                Choose the main audience for this content:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-5">
                {AUDIENCES.map((a) => {
                  const active = a === audience;
                  const label =
                    a.charAt(0).toUpperCase() + a.slice(1).toLowerCase();
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAudience(a)}
                      className={`flex items-center justify-between rounded-full border px-4 py-2
                        ${
                          active
                            ? "border-white bg-white text-black"
                            : "border-white/25 hover:bg-white/10"
                        }`}
                    >
                      <span
                        className={`text-base ${
                          active ? "font-semibold" : ""
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        className={`h-4 w-4 rounded-full border ${
                          active
                            ? "border-black bg-black/80"
                            : "border-white/40"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => setStep(2)}
                  className="w-full sm:w-56 h-11 rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 – tags */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-white/80">
                Select{" "}
                <span className="font-semibold">3 – 10</span> tags to describe
                your upload.
              </p>

              {/* Search + Add */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60">
                    <Search className="h-4 w-4" />
                  </span>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type a tag…"
                    className="pl-9 bg-black/40 border-white/20"
                  />
                </div>
                <Button
                  onClick={() => addTag(query)}
                  variant="secondary"
                  className="rounded-full"
                  disabled={!query.trim() || tags.length >= 10}
                >
                  Add New Tag
                </Button>
              </div>

              {/* Selected tags */}
              {tags.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        className="rounded-full bg-transparent border border-[--badge] text-white"
                        style={{ ["--badge" as any]: ACCENT }}
                      >
                        <span className="mr-1.5">{t}</span>
                        <button
                          className="ml-1 -mr-1.5 rounded-full p-0.5 hover:bg-white/10"
                          onClick={() => removeTag(t)}
                          aria-label={`Remove ${t}`}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Separator className="bg-white/10" />
                </>
              )}

              {/* Suggestions */}
              <div className="space-y-2">
                <div className="text-sm text-white/70">Suggestions</div>
                <div className="max-h-40 flex flex-wrap gap-2 overflow-y-auto">
                  {filtered.map((t) => {
                    const active = tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => (active ? removeTag(t) : addTag(t))}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors
                          ${
                            active
                              ? "bg-[--accent] text-white border-transparent"
                              : "border-[--accent] text-white/90 hover:bg-[--accent]/10"
                          }`}
                        style={{ ["--accent" as any]: ACCENT }}
                        aria-pressed={active}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nav */}
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="rounded-full"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                  disabled={!canNextFromTags}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 – description */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-white/80">
                <span className="font-semibold">
                  Posts with clear descriptions with your username included tend to perform better.
                </span>
              </p>

              <Textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a short description…"
                className="bg-black/40 border-white/20"
              />

              {submitError && (
                <p className="text-xs text-red-400">{submitError}</p>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  className="rounded-full"
                >
                  Back
                </Button>
                <Button
                  onClick={submit}
                  className="w-30 sm:w-56 h-11 rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                >
                  {loading ? <Loader /> : "Submit"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}












// // app/components/upload/UploadFlow.tsx
// "use client";

// import * as React from "react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import { ChevronLeft, X as XIcon, Search, Loader } from "lucide-react";
// import type { AudienceType } from "@/lib/actions/media";
// import { useState } from "react";

// export type ClipSelection = {
//   start: number;
//   end: number;
//   muted: boolean;
//   file: File;
// };

// export type ImageSelection = {
//   files: File[]; // ordered files
//   order: number[]; // original indices in chosen order
//   coverIndex: number; // index inside ordered array
//   urls?: string[];
// };

// export type UploadFlowSubmitPayload = {
//   audience: AudienceType;
//   tags: string[];
//   description: string;
//   kind: "video" | "images";
//   clip?: ClipSelection;
//   images?: ImageSelection;
// };

// type BaseHandlers = {
//   onCancel: () => void;
//   onSubmit: (payload: UploadFlowSubmitPayload) => boolean;
// };

// type Props =
//   | ({ variant: "video"; clip: ClipSelection } & BaseHandlers)
//   | ({ variant: "images"; images: ImageSelection } & BaseHandlers);

// const ACCENT = "pink";

// // Must match audience_type enum
// const AUDIENCES: AudienceType[] = [
//   "straight",
//   "gay",
//   "trans",
//   "bisexual",
//   "lesbian",
//   "animated",
// ];

// const SUGGESTED = [
//   "Trending", "POV"
// ];



// function Stepper({ step, total = 3 }: { step: number; total?: number }) {
//   const pct = (step - 1) / (total - 1);
//   return (
//     <div className="w-full">
//       <div className="h-0.5 bg-white/15 rounded-full relative">
//         <div
//           className="h-0.5 rounded-full"
//           style={{ width: `${pct * 100}%`, backgroundColor: ACCENT }}
//         />
//         <div
//           className="absolute -top-[5px] h-3 w-3 rounded-full"
//           style={{
//             left: `calc(${pct * 100}% - 6px)`,
//             backgroundColor: ACCENT,
//           }}
//         />
//       </div>
//     </div>
//   );
// }

// export default function UploadFlow(props: Props) {
//   const [step, setStep] = React.useState<1 | 2 | 3>(1);
//   const [audience, setAudience] = React.useState<AudienceType>(AUDIENCES[0]);
//   const [tags, setTags] = React.useState<string[]>([]);
//   const [query, setQuery] = React.useState("");
//   const [description, setDescription] = React.useState("");
//   const [loading, setLoading] = useState(false)

//   const filtered = React.useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return SUGGESTED.filter((t) =>
//       t.toLowerCase().includes(q)
//     ).slice(0, 30);
//   }, [query]);

//   const addTag = (t: string) => {
//     const v = t.trim();
//     if (!v) return;
//     const cap = v[0].toUpperCase() + v.slice(1);
//     if (tags.includes(cap) || tags.length >= 10) return;
//     setTags((p) => [...p, cap]);
//     setQuery("");
//   };

//   const removeTag = (t: string) => setTags((p) => p.filter((x) => x !== t));

//   const canNextFromTags = tags.length >= 3 && tags.length <= 10;

//   const submit = () => {
    
//       setLoading(prev => !prev)
//       let load;
//       if (props.variant === "video") {
//             load = props.onSubmit({
//               audience,
//               tags,
//               description,
//               kind: "video",
//               clip: props.clip,
//             }).then(() => {setLoading(false)})
//           } else {
//             props.onSubmit({
//               audience,
//               tags,
//               description,
//               kind: "images",
//               images: props.images,
//             }).then(() => {setLoading(false)});

//           }
//     }
    


//   const titleForStep =
//     step === 1
//       ? "Choose main audience"
//       : step === 2
//       ? "Add Tags"
//       : "Description";

//   return (
//     <div className="mx-auto max-w-[880px] px-4 py-6 space-y-6 mb-20">
//       <div className="space-y-3">
//         <h1 className="text-2xl font-semibold">Upload Content</h1>
//         <Stepper step={step} />
//       </div>

//       <div className="rounded-2xl bg-[#121212] border border-white/10">
//         <div className="flex items-center gap-2 p-4 border-b border-white/10">
//           <button
//             onClick={() =>
//               step === 1
//                 ? props.onCancel()
//                 : setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
//             }
//             className="rounded-full p-2 hover:bg-white/10"
//             aria-label="Back"
//           >
//             <ChevronLeft className="h-5 w-5" />
//           </button>
//           <p className="font-semibold text-lg">{titleForStep}</p>
//         </div>

//         <div className="p-5 sm:p-6">
//           {/* STEP 1 – audience */}
//           {step === 1 && (
//             <div className="space-y-6">
//               <p className="text-sm text-white/80">
//                 Choose the main audience for this content:
//               </p>
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-5">
//                 {AUDIENCES.map((a) => {
//                   const active = a === audience;
//                   const label =
//                     a.charAt(0).toUpperCase() + a.slice(1).toLowerCase();
//                   return (
//                     <button
//                       key={a}
//                       type="button"
//                       onClick={() => setAudience(a)}
//                       className={`flex items-center justify-between rounded-full border px-4 py-2
//                         ${
//                           active
//                             ? "border-white bg-white text-black"
//                             : "border-white/25 hover:bg-white/10"
//                         }`}
//                     >
//                       <span
//                         className={`text-base ${
//                           active ? "font-semibold" : ""
//                         }`}
//                       >
//                         {label}
//                       </span>
//                       <span
//                         className={`h-4 w-4 rounded-full border ${
//                           active
//                             ? "border-black bg-black/80"
//                             : "border-white/40"
//                         }`}
//                       />
//                     </button>
//                   );
//                 })}
//               </div>
//               <div className="pt-2">
//                 <Button
//                   onClick={() => setStep(2)}
//                   className="w-full sm:w-56 h-11 rounded-full text-black font-semibold"
//                   style={{ backgroundColor: ACCENT }}
//                 >
//                   Next
//                 </Button>
//               </div>
//             </div>
//           )}

//           {/* STEP 2 – tags */}
//           {step === 2 && (
//             <div className="space-y-5">
//               <p className="text-sm text-white/80">
//                 Select{" "}
//                 <span className="font-semibold">3 – 10</span> tags to describe
//                 your upload.
//               </p>

//               {/* Search + Add */}
//               <div className="flex items-center gap-2">
//                 <div className="relative flex-1">
//                   <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60">
//                     <Search className="h-4 w-4" />
//                   </span>
//                   <Input
//                     value={query}
//                     onChange={(e) => setQuery(e.target.value)}
//                     placeholder="Type a tag…"
//                     className="pl-9 bg-black/40 border-white/20"
//                   />
//                 </div>
//                 <Button
//                   onClick={() => addTag(query)}
//                   variant="secondary"
//                   className="rounded-full"
//                   disabled={!query.trim() || tags.length >= 10}
//                 >
//                   Add tag
//                 </Button>
//               </div>

//               {/* Selected tags */}
//               {tags.length > 0 && (
//                 <>
//                   <div className="flex flex-wrap gap-2">
//                     {tags.map((t) => (
//                       <Badge
//                         key={t}
//                         className="rounded-full bg-transparent border border-[--badge] text-white"
//                         style={{ ["--badge" as any]: ACCENT }}
//                       >
//                         <span className="mr-1.5">{t}</span>
//                         <button
//                           className="ml-1 -mr-1.5 rounded-full p-0.5 hover:bg-white/10"
//                           onClick={() => removeTag(t)}
//                           aria-label={`Remove ${t}`}
//                         >
//                           <XIcon className="h-3.5 w-3.5" />
//                         </button>
//                       </Badge>
//                     ))}
//                   </div>
//                   <Separator className="bg-white/10" />
//                 </>
//               )}

//               {/* Suggestions */}
//               <div className="space-y-2">
//                 <div className="text-sm text-white/70">Suggestions</div>
//                 <div className="max-h-40 flex flex-wrap gap-2 overflow-y-auto">
//                   {filtered.map((t) => {
//                     const active = tags.includes(t);
//                     return (
//                       <button
//                         key={t}
//                         type="button"
//                         onClick={() => (active ? removeTag(t) : addTag(t))}
//                         className={`px-3 py-1.5 rounded-full border text-sm transition-colors
//                           ${
//                             active
//                               ? "bg-[--accent] text-white border-transparent"
//                               : "border-[--accent] text-white/90 hover:bg-[--accent]/10"
//                           }`}
//                         style={{ ["--accent" as any]: ACCENT }}
//                         aria-pressed={active}
//                       >
//                         {t}
//                       </button>
//                     );
//                   })}
//                 </div>
//               </div>

//               {/* Nav */}
//               <div className="flex justify-between pt-2">
//                 <Button
//                   variant="ghost"
//                   onClick={() => setStep(1)}
//                   className="rounded-full"
//                 >
//                   Back
//                 </Button>
//                 <Button
//                   onClick={() => setStep(3)}
//                   className="rounded-full text-black font-semibold"
//                   style={{ backgroundColor: ACCENT }}
//                   disabled={!canNextFromTags}
//                 >
//                   Next
//                 </Button>
//               </div>
//             </div>
//           )}

//           {/* STEP 3 – description */}
//           {step === 3 && (
//             <div className="space-y-5">
//               <p className="text-sm text-white/80">
//                 <span className="font-semibold">
//                   Posts with clear descriptions tend to perform better.
//                 </span>
//               </p>

//               <Textarea
//                 rows={6}
//                 value={description}
//                 onChange={(e) => setDescription(e.target.value)}
//                 placeholder="Write a short description…"
//                 className="bg-black/40 border-white/20"
//               />

//               <div className="flex justify-between pt-2">
//                 <Button
//                   variant="ghost"
//                   onClick={() => setStep(2)}
//                   className="rounded-full"
//                 >
//                   Back
//                 </Button>
//                 <Button
//                   onClick={submit}
//                   className="w-30 sm:w-56 h-11 rounded-full text-black font-semibold"
//                   style={{ backgroundColor: ACCENT }}
//                 >
//                   {loading ?  <Loader /> : "Submit" }
//                 </Button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }
