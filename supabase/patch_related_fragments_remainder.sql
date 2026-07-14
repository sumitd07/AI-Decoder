-- Decoder — remainder of patch_related_fragments.sql (last 6 statements didn't apply;
-- likely a truncated SQL Editor paste). Idempotent — safe to re-run.

update public.concepts set related='[{"text":"A kind of optimizer.","id":"optimizer"},{"text":"Improves on stochastic gradient descent.","id":"sgd"},{"text":"Refined by AdamW.","id":"adamw"}]'::jsonb, updated_at=now() where id='adam';
update public.concepts set related='[{"text":"Fixes Adam.","id":"adam"},{"text":"The decay term is weight decay.","id":"weightdecay"},{"text":"Paired with warmup.","id":"warmup"}]'::jsonb, updated_at=now() where id='adamw';
update public.concepts set related='[{"text":"A form of regularization.","id":"regularization"},{"text":"Reduces overfitting.","id":"overfitting"},{"text":"Decoupled in AdamW.","id":"adamw"}]'::jsonb, updated_at=now() where id='weightdecay';
update public.concepts set related='[{"text":"Includes weight decay.","id":"weightdecay"},{"text":"Also includes dropout.","id":"dropout"},{"text":"Improves generalization.","id":"generalization"}]'::jsonb, updated_at=now() where id='regularization';
update public.concepts set related='[{"text":"Tames the gradient.","id":"gradient"},{"text":"Stabilizes gradient descent.","id":"gradientdescent"},{"text":"Guards the learning rate.","id":"learningrate"}]'::jsonb, updated_at=now() where id='gradientclipping';
update public.concepts set related='[{"text":"Simulates a larger batch size.","id":"batchsize"},{"text":"Defers the optimizer step.","id":"optimizer"},{"text":"Spreads one step across iterations.","id":"iteration"}]'::jsonb, updated_at=now() where id='gradientaccumulation';
