UPDATE public.tab_journal_entry_details d
SET description = t.descr,
    source_type = t.stype,
    source_ref = t.sref
FROM public.tmp_desc_fix t
WHERE d.id = t.detail_id;

DROP TABLE public.tmp_desc_fix;