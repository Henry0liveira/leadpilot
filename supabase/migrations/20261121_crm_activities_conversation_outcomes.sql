-- LeadPilot: CRM activities and AI conversation outcomes
-- Applied to Supabase project ghpugplmdssxqoihbfkt on 2026-11-21.
-- Keep as schema history; DO NOT rerun on the same project without checking existing tables.

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  conversation_id uuid,
  activity_type text not null check (activity_type in ('note','call','whatsapp','email','meeting','proposal','follow_up','stage_change','task','other')),
  title text not null,
  description text,
  status text not null default 'completed' check (status in ('pending','completed','canceled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads(id, owner_id) on delete cascade,
  foreign key (conversation_id, owner_id) references public.conversations(id, owner_id) on delete set null (conversation_id)
);
create table public.conversation_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  lead_id uuid,
  outcome text not null check (outcome in ('pending','qualified','interested','not_interested','no_response','follow_up','meeting_booked','proposal_sent','won','lost','human_handoff','other')),
  sentiment text check (sentiment in ('positive','neutral','negative','mixed','unknown')),
  summary text,
  main_need text,
  objections text,
  next_action text,
  next_action_at timestamptz,
  extracted_by text not null default 'manual' check (extracted_by in ('manual','groq','system')),
  model_name text,
  confidence numeric(4,3) check (confidence>=0 and confidence<=1),
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.conversations(id, owner_id) on delete cascade,
  foreign key (lead_id, owner_id) references public.leads(id, owner_id) on delete set null (lead_id)
);
create index idx_crm_activities_owner_lead on public.crm_activities(owner_id,lead_id,created_at desc);
create index idx_crm_activities_due on public.crm_activities(owner_id,due_at) where status='pending';
create index idx_crm_activities_conversation on public.crm_activities(conversation_id) where conversation_id is not null;
create index idx_conversation_outcomes_owner_conv on public.conversation_outcomes(owner_id,conversation_id,recorded_at desc);
create index idx_conversation_outcomes_lead on public.conversation_outcomes(owner_id,lead_id) where lead_id is not null;
create index idx_conversation_outcomes_next_action on public.conversation_outcomes(owner_id,next_action_at) where next_action_at is not null;
alter table public.crm_activities enable row level security;
alter table public.conversation_outcomes enable row level security;
revoke all on public.crm_activities,public.conversation_outcomes from anon,authenticated;
grant select on public.crm_activities,public.conversation_outcomes to authenticated;
grant all on public.crm_activities,public.conversation_outcomes to service_role;
create policy crm_activities_owner_read on public.crm_activities for select to authenticated
  using ((select auth.uid())=owner_id);
create policy conversation_outcomes_owner_read on public.conversation_outcomes for select to authenticated
  using ((select auth.uid())=owner_id);
