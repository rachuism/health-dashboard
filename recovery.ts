// Runs the recovery-signal autoencoder (trained offline, see ml/) against
// today's history entry, entirely client-side. No backend: the ONNX model
// and normalization stats are static files fetched from /model/, and
// onnxruntime-web itself is loaded from a CDN only when this is actually
// called (its WASM runtime is ~11MB -- see the conversation this came from
// for why that's not bundled into the app or vendored into the repo).
//
// /model/ is intentionally empty until you've trained on real history
// (ml/README.md) and copied the two output files there yourself -- a
// synthetic/placeholder model must never silently ship as someone's real
// recovery signal.

import type { DailyHistoryEntry } from "./history.js";

const ORT_VERSION = "1.20.1"; // pin: the JS glue and the .wasm binary it fetches must match
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ORT_ENTRY = `${ORT_BASE}ort.wasm.min.mjs`;

type FeatureKey = keyof Omit<DailyHistoryEntry, "date">;

type Normalization = {
  featureOrder: FeatureKey[];
  mean: number[];
  std: number[];
  threshold: number;
};

// Minimal shape of onnxruntime-web's exports that this module actually
// calls -- the real package isn't installed (loaded from a CDN instead, see
// above), so there are no .d.ts types to import.
type OrtTensor = unknown;
type OrtSession = {
  run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, { data: Float32Array }>>;
};
type OrtModule = {
  env: { wasm: { wasmPaths: string } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create: (path: string) => Promise<OrtSession> };
};

export type RecoverySignal = {
  flagged: boolean;
  totalError: number;
  threshold: number;
  perFeature: { feature: FeatureKey; error: number }[];
};

type Loaded = { ort: OrtModule; session: OrtSession; normalization: Normalization };

let loadedPromise: Promise<Loaded> | null = null;

async function load(): Promise<Loaded> {
  if (!loadedPromise) {
    loadedPromise = (async () => {
      // ORT_ENTRY is a non-literal expression on purpose: a literal string
      // here would make TypeScript try (and fail) to resolve it as a real
      // module. That's also why OrtModule above is hand-typed instead of
      // coming from @types.
      const [normalizationResponse, ort] = await Promise.all([
        fetch("/model/normalization.json"),
        import(ORT_ENTRY) as Promise<OrtModule>,
      ]);
      if (!normalizationResponse.ok) {
        throw new Error("No trained recovery model deployed at /model/ yet.");
      }
      const normalization = (await normalizationResponse.json()) as Normalization;
      ort.env.wasm.wasmPaths = ORT_BASE;
      const session = await ort.InferenceSession.create("/model/recovery_model.onnx");
      return { ort, session, normalization };
    })().catch((error: unknown) => {
      loadedPromise = null; // allow retrying later, e.g. once a model has been deployed
      throw error;
    });
  }
  return loadedPromise;
}

export async function scoreToday(entry: DailyHistoryEntry): Promise<RecoverySignal> {
  const { ort, session, normalization } = await load();
  const { featureOrder, mean, std, threshold } = normalization;

  const raw = featureOrder.map((key) => {
    const value = entry[key];
    if (value == null) throw new Error(`Missing ${key} in today's entry.`);
    return value;
  });
  const normalizedInput = Float32Array.from(raw.map((value, i) => (value - mean[i]) / std[i]));

  const tensor = new ort.Tensor("float32", normalizedInput, [1, featureOrder.length]);
  const outputs = await session.run({ metrics: tensor });
  const reconstruction = outputs.reconstruction.data;

  const perFeature = featureOrder
    .map((feature, i) => ({ feature, error: (normalizedInput[i] - reconstruction[i]) ** 2 }))
    .sort((a, b) => b.error - a.error);
  const totalError = perFeature.reduce((sum, f) => sum + f.error, 0);

  return { flagged: totalError > threshold, totalError, threshold, perFeature };
}
