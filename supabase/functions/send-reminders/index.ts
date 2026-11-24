import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function localDateAndTime(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function nextDate(date: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function formatDate(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !emailFrom) {
    console.error("Missing required Supabase or Resend environment variables.");
    return new Response("Server configuration is incomplete.", { status: 500, headers: corsHeaders });
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id,email,display_name,timezone,remind_today_at,remind_tomorrow_at,remind_today,remind_tomorrow");
  if (profilesError) {
    console.error("Could not load reminder profiles.", profilesError);
    return new Response("Could not load reminder profiles.", { status: 500, headers: corsHeaders });
  }

  const results: Array<{ userId: string; mode: string; status: string }> = [];
  for (const profile of profiles || []) {
    const timeZone = profile.timezone || "Asia/Jerusalem";
    let local;
    try {
      local = localDateAndTime(timeZone);
    } catch (error) {
      console.error(`Invalid timezone for profile ${profile.user_id}.`, error);
      results.push({ userId: profile.user_id, mode: "all", status: "invalid_timezone" });
      continue;
    }

    const reminders = [
      { mode: "today", enabled: profile.remind_today, at: profile.remind_today_at, date: local.date },
      { mode: "tomorrow", enabled: profile.remind_tomorrow, at: profile.remind_tomorrow_at, date: nextDate(local.date) },
    ].filter((reminder) => reminder.enabled && local.time === String(reminder.at).slice(0, 5));

    for (const reminder of reminders) {
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("title,category,notes,task_time")
        .eq("user_id", profile.user_id)
        .eq("due_date", reminder.date)
        .order("created_at");
      if (tasksError) {
        console.error(`Could not load tasks for profile ${profile.user_id}.`, tasksError);
        results.push({ userId: profile.user_id, mode: reminder.mode, status: "task_lookup_failed" });
        continue;
      }
      if (!tasks?.length) continue;

      const { data: priorDelivery, error: deliveryLookupError } = await supabase
        .from("reminder_deliveries")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("task_date", reminder.date)
        .eq("mode", reminder.mode)
        .maybeSingle();
      if (deliveryLookupError) {
        console.error(`Could not check reminder history for ${profile.user_id}.`, deliveryLookupError);
        results.push({ userId: profile.user_id, mode: reminder.mode, status: "history_lookup_failed" });
        continue;
      }
      if (priorDelivery) continue;

      const taskLines = tasks
        .sort((first, second) => (first.task_time || "99:99").localeCompare(second.task_time || "99:99"))
        .map((task) => {
          const category = ({ assignment: "הגשה", project: "פרויקט", exam: "מבחן", practice: "תרגול" } as Record<string, string>)[task.category] || "מטלה";
          return `• ${task.task_time ? `${String(task.task_time).slice(0, 5)} · ` : ""}[${category}] ${task.title}${task.notes ? ` — ${task.notes}` : ""}`;
        })
        .join("\n");
      const dayLabel = formatDate(reminder.date, timeZone);
      const heading = reminder.mode === "today" ? "המשימות שלך להיום" : "מבט קטן למחר";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [profile.email],
          subject: `${heading} · ${dayLabel}`,
          text: `היי${profile.display_name ? ` ${profile.display_name}` : ""},\n\n${heading} (${dayLabel}):\n\n${taskLines}\n\nצעד קטן בכל פעם 💜`,
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        console.error(`Email delivery failed for ${profile.user_id}: ${response.status} ${details}`);
        results.push({ userId: profile.user_id, mode: reminder.mode, status: "email_failed" });
        continue;
      }

      const { error: deliveryError } = await supabase.from("reminder_deliveries").insert({
        user_id: profile.user_id,
        task_date: reminder.date,
        mode: reminder.mode,
      });
      if (deliveryError) {
        console.error(`Email sent but reminder history could not be saved for ${profile.user_id}.`, deliveryError);
        results.push({ userId: profile.user_id, mode: reminder.mode, status: "sent_history_failed" });
        continue;
      }
      results.push({ userId: profile.user_id, mode: reminder.mode, status: "sent" });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
