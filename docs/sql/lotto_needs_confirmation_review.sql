-- Lotto (e20db933-fa3d-461e-a9e1-0fcbaa10af8a, canonical 'lotto') is needs_confirmation=true as of 2026-11-18 (updated_at 2026-11-17T06:24:45.793151+00:00).
-- Likely cause: needs_confirmation is set from many jobs resolving to multiple candidate clients
-- (ambiguous/variant resolution), not from "alias present" alone. Aliases LOTTO/Lotto exist for this client.
-- Corrected flagging function installation could not be verified read-only from app credentials:
-- no migration in supabase/migrations defining a needs_confirmation-flagging function was found,
-- and direct pg_proc inspection/RPC probes are not available without DB access. Treat as UNVERIFIED.
-- DO NOT run changes.
SELECT id, canonical_name, needs_confirmation, created_at, updated_at
FROM public.client_360_clients
WHERE organization_id = 'org-1792039761662-m59i0f8' AND id = 'e20db933-fa3d-461e-a9e1-0fcbaa10af8a';

SELECT id, client_id, alias_text, created_at
FROM public.client_360_client_aliases
WHERE organization_id = 'org-1792039761662-m59i0f8' AND client_id = 'e20db933-fa3d-461e-a9e1-0fcbaa10af8a'
ORDER BY alias_text;

-- If a fix is desired later (review first): clear flag only when confirmed unambiguous
-- UPDATE public.client_360_clients SET needs_confirmation = false, updated_at = now()
-- WHERE organization_id = 'org-1792039761662-m59i0f8' AND id = 'e20db933-fa3d-461e-a9e1-0fcbaa10af8a';
