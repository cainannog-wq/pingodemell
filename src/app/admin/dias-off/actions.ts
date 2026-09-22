"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/dal";
import { parseDiaOffData } from "@/lib/dias-off/parse";

export async function createDiaOff(dataIso: string): Promise<{ id?: string; error?: string }> {
  await requireAuth();

  const parsed = parseDiaOffData(dataIso);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("dias_off")
    .insert({ data: parsed.data })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Essa data já está marcada como dia off." };
    }
    return { error: `Não foi possível salvar o dia off: ${error.message}` };
  }

  revalidatePath("/admin/dias-off");
  return { id: inserted.id };
}

export async function deleteDiaOff(id: string): Promise<{ error?: string }> {
  await requireAuth();

  const supabase = await createClient();
  const { error } = await supabase.from("dias_off").delete().eq("id", id);

  if (error) {
    return { error: `Não foi possível remover o dia off: ${error.message}` };
  }

  revalidatePath("/admin/dias-off");
  return {};
}
