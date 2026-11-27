-- Notes sync between PCs. Run after 20261126000000_sync.sql.
--
-- Adds the 'note' kind to ada_records and replaces ada_push so it accepts notes:
-- fields title, body, folder, pinned, and createdAt, with room for long note text.
-- Until this runs, Ada keeps notes on each PC and retries them every sync round.
--
-- Paste this whole file into the Supabase SQL Editor once.

alter table public.ada_records drop constraint if exists ada_records_kind_check;
alter table public.ada_records add constraint ada_records_kind_check
  check (kind in ('tag', 'project', 'task', 'session', 'note'));

-- Applies a batch of up to 200 operations from one PC.
--
-- One operation:
--   {"opId": uuid, "kind": text, "id": uuid, "base": revision this PC last saw (0 if new),
--    "fields": {changed fields only}, "delete": bool, "restore": bool}
--
-- Returns one outcome per operation, in order:
--   {"opId", "status": "applied" | "conflict" | "deleted" | "rejected",
--    "conflicts": [field names kept at the server's value],
--    "record": {"kind", "id", "fields", "deleted", "revision"} or null}
create or replace function public.ada_push(device uuid, ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rev bigint;
  results jsonb := '[]'::jsonb;
  op jsonb;
  v_outcome jsonb;
  v_op_id uuid;
  v_kind text;
  v_id uuid;
  v_base bigint;
  v_fields jsonb;
  v_delete boolean;
  v_restore boolean;
  v_allowed text[];
  v_status text;
  v_conflicts jsonb;
  v_next_fields jsonb;
  v_next_meta jsonb;
  v_meta jsonb;
  v_key text;
  v_value jsonb;
  v_name text;
  v_suffix int;
  v_lot bigint;
  v_changed boolean;
  v_found boolean;
  cur public.ada_records%rowtype;
  v_record jsonb;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if device is null or ops is null or jsonb_typeof(ops) <> 'array' then
    raise exception 'Invalid sync request' using errcode = '22023';
  end if;
  if jsonb_array_length(ops) > 200 then
    raise exception 'Too many sync operations in one request' using errcode = '22023';
  end if;

  -- Locking the cursor row serializes this user's pushes, so revisions commit in order
  -- and a pull of "revision > cursor" never skips a change that commits late.
  insert into public.ada_cursors (user_id) values (me) on conflict (user_id) do nothing;
  select c.revision into rev from public.ada_cursors c where c.user_id = me for update;

  delete from public.ada_ops o where o.user_id = me and o.created_at < now() - interval '30 days';

  for op in select e.value from jsonb_array_elements(ops) as e loop
    v_op_id := null;
    begin
      v_op_id := (op ->> 'opId')::uuid;
      v_id := (op ->> 'id')::uuid;
      v_base := coalesce((op ->> 'base')::bigint, 0);
      v_delete := coalesce((op ->> 'delete')::boolean, false);
      v_restore := coalesce((op ->> 'restore')::boolean, false);
    exception when others then
      raise exception 'Invalid sync operation' using errcode = '22023';
    end;
    if v_op_id is null then
      raise exception 'Invalid sync operation' using errcode = '22023';
    end if;

    select o.outcome into v_outcome from public.ada_ops o where o.user_id = me and o.op_id = v_op_id;
    if found then
      results := results || jsonb_build_array(v_outcome);
      continue;
    end if;

    v_kind := op ->> 'kind';
    v_fields := coalesce(op -> 'fields', '{}'::jsonb);
    v_conflicts := '[]'::jsonb;
    v_status := 'applied';
    v_allowed := case v_kind
      when 'tag' then array['name', 'archived', 'lot']
      when 'project' then array['name', 'archived']
      when 'task' then array['title', 'due', 'notes', 'project', 'important', 'urgent',
        'recurrence', 'recurrenceDay', 'previous', 'lastTag', 'status', 'tags', 'subtasks']
      when 'session' then array['tag', 'task', 'project', 'activity', 'targetMs',
        'startedAt', 'endedAt', 'intervals']
      when 'note' then array['title', 'body', 'folder', 'pinned', 'createdAt']
    end;

    if v_allowed is null or v_id is null or jsonb_typeof(v_fields) <> 'object'
      or octet_length(v_fields::text) > case when v_kind = 'note' then 2200000 else 65536 end
      or exists (select 1 from jsonb_object_keys(v_fields) k where k <> all (v_allowed))
      or (v_fields ? 'name' and (jsonb_typeof(v_fields -> 'name') <> 'string'
        or btrim(v_fields ->> 'name') = ''))
      or (v_fields ? 'lot' and jsonb_typeof(v_fields -> 'lot') <> 'number') then
      v_status := 'rejected';
    end if;

    if v_status = 'applied' then
      select * into cur from public.ada_records r
        where r.user_id = me and r.kind = v_kind and r.id = v_id for update;
      v_found := found;

      if v_found and cur.deleted and not v_restore then
        -- Deletion wins over edits made elsewhere.
        if not v_delete then
          v_status := 'deleted';
        end if;

      elsif v_delete then
        if v_found then
          rev := rev + 1;
          update public.ada_records r
            set deleted = true, fields = '{}'::jsonb, field_meta = '{}'::jsonb,
                revision = rev, updated_at = now()
            where r.user_id = me and r.kind = v_kind and r.id = v_id;
        end if;

      elsif not v_found or cur.deleted then
        -- New record, or one this PC chose to keep after another PC deleted it.
        if v_kind in ('tag', 'project') and not (v_fields ? 'name') then
          v_status := 'rejected';
        else
          rev := rev + 1;
          v_next_fields := v_fields;
          if v_kind in ('tag', 'project') then
            v_name := v_fields ->> 'name';
            v_suffix := 1;
            while exists (
              select 1 from public.ada_records r
              where r.user_id = me and r.kind = v_kind and not r.deleted and r.id <> v_id
                and lower(r.fields ->> 'name') = lower(v_next_fields ->> 'name')
            ) loop
              v_suffix := v_suffix + 1;
              v_next_fields := jsonb_set(v_next_fields, '{name}',
                to_jsonb(v_name || ' (' || v_suffix || ')'));
            end loop;
            if v_suffix > 1 then
              v_conflicts := v_conflicts || '["name"]'::jsonb;
            end if;
          end if;
          if v_kind = 'tag' then
            -- The first PC to place a district wins; a later one gets the next free lot.
            v_lot := case when jsonb_typeof(v_fields -> 'lot') = 'number'
              then floor((v_fields ->> 'lot')::numeric)::bigint end;
            if v_lot is null or v_lot < 0 or exists (
              select 1 from public.ada_records r
              where r.user_id = me and r.kind = 'tag' and not r.deleted and r.id <> v_id
                and (r.fields ->> 'lot')::bigint = v_lot
            ) then
              select coalesce(max((r.fields ->> 'lot')::bigint) + 1, 0) into v_lot
                from public.ada_records r
                where r.user_id = me and r.kind = 'tag' and not r.deleted and r.id <> v_id;
            end if;
            v_next_fields := jsonb_set(v_next_fields, '{lot}', to_jsonb(v_lot));
          end if;
          select coalesce(jsonb_object_agg(k, jsonb_build_object('r', rev, 'd', device)), '{}'::jsonb)
            into v_next_meta from jsonb_object_keys(v_next_fields) k;
          insert into public.ada_records as r (user_id, kind, id, fields, field_meta, deleted, revision)
            values (me, v_kind, v_id, v_next_fields, v_next_meta, false, rev)
            on conflict (user_id, kind, id) do update
              set fields = excluded.fields, field_meta = excluded.field_meta,
                  deleted = false, revision = excluded.revision, updated_at = now();
          if jsonb_array_length(v_conflicts) > 0 then
            v_status := 'conflict';
          end if;
        end if;

      else
        -- Field by field: a change applies when nobody else changed that field since
        -- this PC last saw the record, or when this PC made the last change itself.
        v_next_fields := cur.fields;
        v_next_meta := cur.field_meta;
        v_changed := false;
        for v_key, v_value in select e.key, e.value from jsonb_each(v_fields) as e loop
          if cur.fields -> v_key is not distinct from v_value then
            continue;
          end if;
          if v_kind = 'tag' and v_key = 'lot' then
            -- A district never moves once placed.
            continue;
          end if;
          v_meta := cur.field_meta -> v_key;
          if v_meta is not null and (v_meta ->> 'r')::bigint > v_base
            and v_meta ->> 'd' is distinct from device::text then
            v_conflicts := v_conflicts || jsonb_build_array(v_key);
            continue;
          end if;
          if v_key = 'name' and exists (
            select 1 from public.ada_records r
            where r.user_id = me and r.kind = v_kind and not r.deleted and r.id <> v_id
              and lower(r.fields ->> 'name') = lower(v_value #>> '{}')
          ) then
            v_conflicts := v_conflicts || jsonb_build_array(v_key);
            continue;
          end if;
          v_next_fields := jsonb_set(v_next_fields, array[v_key], v_value);
          v_next_meta := jsonb_set(v_next_meta, array[v_key],
            jsonb_build_object('r', rev + 1, 'd', device));
          v_changed := true;
        end loop;
        if v_changed then
          rev := rev + 1;
          update public.ada_records r
            set fields = v_next_fields, field_meta = v_next_meta, revision = rev, updated_at = now()
            where r.user_id = me and r.kind = v_kind and r.id = v_id;
        end if;
        if jsonb_array_length(v_conflicts) > 0 then
          v_status := 'conflict';
        end if;
      end if;
    end if;

    select jsonb_build_object('kind', r.kind, 'id', r.id, 'fields', r.fields,
        'deleted', r.deleted, 'revision', r.revision)
      into v_record from public.ada_records r
      where r.user_id = me and r.kind = v_kind and r.id = v_id;
    if not found then
      v_record := null;
    end if;

    v_outcome := jsonb_build_object('opId', v_op_id, 'status', v_status,
      'conflicts', v_conflicts, 'record', v_record);
    insert into public.ada_ops (user_id, op_id, outcome) values (me, v_op_id, v_outcome)
      on conflict (user_id, op_id) do nothing;
    results := results || jsonb_build_array(v_outcome);
  end loop;

  update public.ada_cursors c set revision = rev where c.user_id = me;
  return results;
end;
$$;

revoke all on function public.ada_push(uuid, jsonb) from public, anon;
grant execute on function public.ada_push(uuid, jsonb) to authenticated;
