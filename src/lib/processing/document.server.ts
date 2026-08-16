import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { PATIENT_DOCUMENTS_BUCKET } from "@/lib/processing/types";

type Client = SupabaseClient<Database>;

/** DocumentService — access to the private patient-documents bucket. */
export const DocumentService = {
  async download(supabase: Client, storagePath: string): Promise<Uint8Array> {
    const { data, error } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .download(storagePath);
    if (error || !data) throw new Error(error?.message ?? "Could not read the uploaded document");
    return new Uint8Array(await data.arrayBuffer());
  },

  async signedUrl(supabase: Client, storagePath: string, expiresIn = 300) {
    const { data, error } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
};
