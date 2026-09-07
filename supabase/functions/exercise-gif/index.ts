import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "exercise-gifs";

// Service-role client for the private cache bucket (bypasses RLS, server-side only).
const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

function gifResponse(body: BodyInit, cache: "HIT" | "MISS") {
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Cache": cache,
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const exerciseId = url.searchParams.get("id");
    const resolution = url.searchParams.get("res") || "180";

    if (!exerciseId || !/^[0-9]{1,4}$/.test(exerciseId) || !/^[0-9]{2,4}$/.test(resolution)) {
      return new Response(JSON.stringify({ error: "Invalid exercise ID or resolution" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = `${exerciseId}_${resolution}.gif`;

    // 1) Cache hit — serve from our own Storage, no ExerciseDB call.
    if (supabase) {
      const { data: cached } = await supabase.storage.from(BUCKET).download(path);
      if (cached) {
        return gifResponse(await cached.arrayBuffer(), "HIT");
      }
    }

    // 2) Cache miss — needs a live ExerciseDB call.
    if (!RAPIDAPI_KEY) {
      return new Response(JSON.stringify({ error: "RAPIDAPI_KEY secret not set" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exerciseId}&resolution=${resolution}`;
    const resp = await fetch(apiUrl, {
      headers: {
        "x-rapidapi-host": "exercisedb.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `ExerciseDB returned ${resp.status}` }), {
        status: resp.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gifBuffer = await resp.arrayBuffer();

    // Guard: only cache real GIFs, never error bodies (e.g. a 200 JSON error).
    const bytes = new Uint8Array(gifBuffer);
    const isGif =
      bytes.length > 6 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46; // "GIF"
    if (!isGif) {
      return new Response(JSON.stringify({ error: "Upstream did not return a GIF" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Persist to Storage so this id/res is fetched from ExerciseDB only once, ever.
    if (supabase) {
      let up = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/gif",
        upsert: true,
      });
      // Lazily create the private bucket on first miss, then retry once.
      if (up.error && /bucket.*not.*found/i.test(up.error.message)) {
        await supabase.storage.createBucket(BUCKET, { public: false });
        up = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: "image/gif",
          upsert: true,
        });
      }
      // A failed cache write is non-fatal — we still serve the GIF this time.
    }

    return gifResponse(gifBuffer, "MISS");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
