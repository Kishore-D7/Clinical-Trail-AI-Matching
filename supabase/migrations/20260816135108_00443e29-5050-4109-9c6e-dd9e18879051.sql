update public.trial_criteria
set criterion_type = 'INCLUSION'
where id = 'dbde85b3-5c1a-4536-80b2-d8c2614a613d'
  and criterion_type = 'EXCLUSION'
  and lower(field) = 'age'
  and operator = '>';