-- A named activity can appear in the four-week manager calendar for open days.
-- Unlike the general note, this field is intentionally short and optional.
-- The existing opening-day RLS already restricts writes to site admins.
alter table public.shift_open_days
 add column if not exists event_title text not null default ''
 check (char_length(event_title)<=120);

comment on column public.shift_open_days.event_title is
 'Optional event/activity name shown in the manager duty calendar on open days; date notes remain separate.';
