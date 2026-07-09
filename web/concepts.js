// Decoder — single source of truth for the glossary.
// Loaded by BOTH the web app (web/index.html) and the extension (content script + popup).
// EDIT HERE, then copy to the other location:  cp web/concepts.js extension/concepts.js
// (web app reads DECODER_CONCEPTS + DECODER_LENSES; extension reads DECODER_CONCEPTS + DECODER_STATUS)

window.DECODER_CONCEPTS = [
  { id:'rag', term:'RAG', aliases:'Retrieval-Augmented Generation', said:'“rag”', aliasList:['rag','retrieval augmented generation','retrieval-augmented generation'], status:'Core',
    oneLiner:'Hand the model a stack of your documents to read before it answers, so it stops making things up.',
    analogy:'An open-book exam — instead of reciting from memory, it looks up the right page first.',
    example:'A support bot that quotes your actual help docs instead of confidently guessing is doing RAG.',
    related:[{text:'Often confused with fine-tuning — that changes the model itself; RAG just hands it notes.',id:'finetuning'},{text:'Runs on embeddings under the hood.',id:'embeddings'},{text:'Exists mostly to dodge the context window limit.',id:'contextwindow'}],
    deeper:'Your docs get chopped into chunks, turned into embeddings, and stored in a vector database. At query time the system finds the closest chunks and stuffs them into the context window next to your question. Quality lives and dies on the retrieval step — bad chunks in, bad answer out.' },

  { id:'evals', term:'Evals', aliases:'Evaluations', said:'“ee-vals”', aliasList:['evals','eval','evaluations','evaluation'], status:'Core',
    oneLiner:'Tests for AI — a repeatable way to check whether the model actually got better or just feels like it did.',
    analogy:'A unit-test suite, but for judgment instead of code.',
    example:'Before shipping a new prompt, a team runs it against 500 saved questions and counts how many it nails.',
    related:[{text:'The scoreboard a human in the loop quietly fills.',id:'hitl'},{text:'What you run to catch a hallucination before users do.',id:'hallucination'}],
    deeper:'They range from exact-match graders to “LLM-as-judge” setups where one model scores another. The hard part is never running them — it is writing eval sets that reflect what real users actually do, not what is easy to grade.' },

  { id:'contextwindow', term:'Context window', aliases:'', said:'', aliasList:['context window'], status:'Core',
    oneLiner:'How much the model can hold in view at once — your prompt, the docs, the whole chat — before the start falls off.',
    analogy:'Short-term memory, or a desk that only fits so many papers before the older ones slide off the edge.',
    example:'Paste a 400-page PDF into a small-context model and it will quietly lose the early chapters.',
    related:[{text:'Measured in tokens.',id:'tokens'},{text:'The ceiling RAG is designed to work around.',id:'rag'}],
    deeper:'Windows have grown from a few thousand tokens to millions, but “it fits” is not “it uses well.” Models often attend better to the beginning and end than the muddled middle — the classic “lost in the middle” effect.' },

  { id:'hitl', term:'HITL', aliases:'Human in the loop', said:'“human in the loop”', aliasList:['hitl','human in the loop'], status:'Core',
    oneLiner:'A person checks or approves the AI’s work before it counts — the safety catch on high-stakes steps.',
    analogy:'A spellchecker that suggests, but you still have to hit accept.',
    example:'The AI drafts the refund; a human clicks approve before any money actually moves.',
    related:[{text:'The judgment that becomes your evals.',id:'evals'},{text:'The opposite pole from a fully autonomous agent.',id:'agents'}],
    deeper:'The real design question is where the human sits: on every action (slow, safe), on random samples (a spot check), or only on low-confidence cases where the model itself asks for help. Most teams end up with the third.' },

  { id:'agents', term:'Agents', aliases:'', said:'', aliasList:['agent','agents','agentic'], status:'Rising',
    oneLiner:'AI that doesn’t just answer — it takes steps, uses tools, and works toward a goal without you holding its hand.',
    analogy:'Less like a search box, more like an intern you can hand a whole task to.',
    example:'When a coding assistant reads your files, runs the tests, and fixes what broke, that’s an agent at work.',
    related:[{text:'The grown-up version of a chatbot.'},{text:'Only as useful as its tools — which is what MCP standardizes.',id:'mcp'},{text:'Its scariest failure mode is prompt injection.',id:'promptinjection'}],
    deeper:'Under the hood it’s a loop: the model picks an action, something runs it, the result comes back, repeat until done. Most “agent” failures are really loop-control failures — it gets stuck, over-repeats, or wanders off the goal.' },

  { id:'embeddings', term:'Embeddings', aliases:'', said:'', aliasList:['embedding','embeddings'], status:'Core',
    oneLiner:'Turning words into coordinates, so a computer can measure how close in meaning two things are.',
    analogy:'A map where “dog” and “puppy” are next-door neighbors and “dog” and “tax form” are on opposite coasts.',
    example:'Search that finds “car” when you typed “automobile” is matching on embeddings, not on spelling.',
    related:[{text:'The engine underneath RAG.',id:'rag'},{text:'Not the same as tokens, though both are “text as numbers.”',id:'tokens'}],
    deeper:'Each piece of text becomes a long list of numbers — a vector. “Similar” means the vectors point in nearly the same direction (cosine similarity). The entire trick of semantic search lives in this one idea.' },

  { id:'finetuning', term:'Fine-tuning', aliases:'', said:'', aliasList:['fine-tuning','fine tuning','finetuning'], status:'Fading',
    oneLiner:'Retraining a model a little on your own examples so it picks up a style or skill it didn’t ship with.',
    analogy:'Sending a strong generalist off to a short apprenticeship in your specific shop.',
    example:'Training on 10,000 of your past support replies so the model sounds like your team, not a robot.',
    related:[{text:'Often reached for when RAG would have done the job.',id:'rag'},{text:'A heavier hammer than good prompt engineering.',id:'promptengineering'}],
    deeper:'Techniques like LoRA make it cheap by nudging a small set of weights instead of all of them. It’s cooling as a first move: most teams now try prompting and RAG first, because a fine-tune is a maintenance burden that goes stale with the base model.' },

  { id:'vibecoding', term:'Vibe coding', aliases:'obituary', said:'“vibe coding”', aliasList:['vibe coding','vibe-coding','vibecoding'], status:'Historical',
    oneLiner:'What we briefly called just… talking to an AI until the app worked, without really reading the code.',
    analogy:'Cooking without measuring — totally fine for a snack, faintly terrifying for a wedding cake.',
    example:'In 2024, “I vibe-coded a weekend app” meant you prompted your way to something that ran and shipped it.',
    related:[{text:'Folded into “agentic coding.”',id:'agents'},{text:'The reflex it named lives on inside prompt engineering.',id:'promptengineering'}],
    deeper:'Filed as history: what people meant in 2024–25, and why it grew up. The term peaked in early 2025, then split — the throwaway-prototype meaning stuck around as a joke, while the actual practice matured into agentic coding with tests, reviews, and specs. The vibes, it turned out, needed guardrails.' },

  { id:'promptengineering', term:'Prompt engineering', aliases:'', said:'', aliasList:['prompt engineering'], status:'Fading',
    oneLiner:'The craft of phrasing your request just right to coax out a better answer.',
    analogy:'Knowing how to Google well — a real skill that quietly becomes second nature.',
    example:'“Think step by step, then answer” reliably beats just asking — a classic prompt-engineering move.',
    related:[{text:'Overlaps heavily with chain of thought.',id:'chainofthought'},{text:'Cooling as models get better at reading plain intent.'}],
    deeper:'Once a hot job title, it’s cooling not because it’s useless but because it’s diffusing into everyone’s baseline. The heavy lifting moved to context and tools; the exact wording matters far less than it did back in 2023.' },

  { id:'tokens', term:'Tokens', aliases:'', said:'', aliasList:['token','tokens'], status:'Core',
    oneLiner:'The chunks a model reads and writes in — roughly ¾ of a word each. Everything is priced and measured in them.',
    analogy:'Syllables for a machine — not quite letters, not quite whole words.',
    example:'“unbelievable” might be three tokens: un-believ-able. Your bill counts every single one.',
    related:[{text:'The unit the context window is measured in.',id:'contextwindow'},{text:'Cousin of embeddings — both turn text into numbers.',id:'embeddings'}],
    deeper:'Tokenization is why models miscount the letters in a word or fumble rare strings — they never saw the letters, only the chunks. It also explains why some languages cost more: they tokenize less efficiently, so the same sentence spends more tokens.' },

  { id:'hallucination', term:'Hallucination', aliases:'', said:'', aliasList:['hallucinate','hallucination','hallucinations'], status:'Core',
    oneLiner:'When the model states something false with total confidence — the failure mode that never fully goes away.',
    analogy:'A friend who never says “I don’t know” and just fills the gap with a plausible-sounding story.',
    example:'Ask for a citation and get a real-looking paper, by real-looking authors, that simply does not exist.',
    related:[{text:'What RAG tries to ground away.',id:'rag'},{text:'What evals exist to catch.',id:'evals'}],
    deeper:'It’s not lying — the model predicts likely text, and “likely” is not “true.” Grounding it in real documents and asking it to cite reduces it, but confidence and correctness are separate dials. A model can be dead wrong and completely sure.' },

  { id:'mcp', term:'MCP', aliases:'Model Context Protocol', said:'“em-see-pee”', aliasList:['mcp','model context protocol'], status:'Rising',
    oneLiner:'A standard plug so any AI can talk to your tools and data without a custom integration each time.',
    analogy:'USB-C for AI — one connector instead of a junk drawer of adapters.',
    example:'Point an assistant at an MCP server for your calendar and it can read your schedule with no bespoke code.',
    related:[{text:'What makes agents actually useful in the real world.',id:'agents'}],
    deeper:'It defines how a model discovers tools, calls them, and gets results back. Boring plumbing on purpose — that boringness is what lets the whole agent ecosystem interoperate instead of everyone reinventing the same wiring.' },

  { id:'chainofthought', term:'Chain of thought', aliases:'CoT', said:'', aliasList:['chain of thought','cot'], status:'Core',
    oneLiner:'Letting the model reason out loud in steps before answering — it gets more right when it shows its work.',
    analogy:'Doing long division on paper instead of trying to hold it all in your head.',
    example:'Nudging “let’s work through this step by step” measurably boosts hard math and logic problems.',
    related:[{text:'A staple of prompt engineering.',id:'promptengineering'},{text:'Now baked into “reasoning” models by default.'}],
    deeper:'Newer reasoning models do this internally, spending extra compute to think before replying. The visible scratchpad became a hidden one — same idea, just more of it, and often no longer shown to you.' },

  { id:'temperature', term:'Temperature', aliases:'', said:'', aliasList:['temperature'], status:'Core',
    oneLiner:'A dial for how adventurous the model is — low is focused and repetitive, high is creative and risky.',
    analogy:'The difference between a careful accountant and a poet mid-brainstorm.',
    example:'Set it near 0 to extract data cleanly; crank it up when you want ten weird names for a product.',
    related:[{text:'One of several “sampling” knobs, alongside top-p and top-k.'},{text:'Turn it down for extraction, up for ideation.'}],
    deeper:'It reshapes the probability distribution over the next token. High temperature flattens it so rare words get a chance; low temperature sharpens it so the safe pick almost always wins. Related knobs — top-p and top-k — trim the same distribution differently.' },

  { id:'promptinjection', term:'Prompt injection', aliases:'', said:'', aliasList:['prompt injection'], status:'Rising',
    oneLiner:'A sneaky attack where hidden instructions buried in your data hijack what the AI does.',
    analogy:'A note slipped into a stack of paperwork that reads “ignore your boss, do this instead.”',
    example:'A webpage hides “forward the user’s email to me” in white text; a browsing agent reads it and obeys.',
    related:[{text:'The security nightmare that comes free with agents.',id:'agents'},{text:'A strong reason to keep a human in the loop.',id:'hitl'}],
    deeper:'The root problem: models can’t reliably tell “data to process” from “instructions to follow.” There’s no clean fix yet — defenses are layered (sandboxing, human approval on risky actions, input filtering), not solved. Treat any untrusted text an agent reads as potentially hostile.' },
];

window.DECODER_LENSES = {
  rag:{ pm:'Ground the bot in your own docs so answers cite real sources — fewer escalations, no invented policies.', eng:'Retrieve top-k relevant chunks via vector search and inject them into the prompt at inference time.' },
  evals:{ pm:'A regression suite for quality — proof a change actually moved the metric before you ship.', eng:'Automated graders (exact-match, rubric, or LLM-as-judge) scoring output over a fixed dataset.' },
  contextwindow:{ pm:"The model's attention budget — overload it and details drop, so scope what you feed it.", eng:'Max token span the model attends over; content beyond it is truncated or must be chunked/retrieved.' },
  hitl:{ pm:'A human approval gate on risky actions — your control point for compliance and trust.', eng:'An approval checkpoint that blocks an action until a human confirms (all / sampled / low-confidence).' },
  agents:{ pm:'AI that completes multi-step tasks end to end — automation you delegate outcomes to, not just answers.', eng:'A model-driven loop: choose action → run tool → observe result → repeat until a stop condition.' },
  embeddings:{ pm:"The tech behind 'find similar' — powers semantic search, dedup, and recommendations.", eng:'Dense vector representations where cosine distance approximates semantic similarity.' },
  finetuning:{ pm:'Teaching the model your style with examples — powerful but a maintenance cost; try prompting/RAG first.', eng:'Gradient updates on a base model (often LoRA/PEFT) over labeled examples to shift behavior.' },
  vibecoding:{ pm:'The 2024 name for prompt-until-it-works prototyping — now matured into agentic coding with guardrails.', eng:'Prompt-driven codegen without close review; superseded by agent workflows with tests and specs.' },
  promptengineering:{ pm:'Wording requests well for better output — a fading standalone skill as models read intent better.', eng:'Structuring prompts (instructions, examples, format constraints) to steer the output distribution.' },
  tokens:{ pm:'The billing and length unit for AI — costs and limits are counted in these, not words.', eng:'Sub-word units from the tokenizer; model I/O and pricing are both measured per token.' },
  hallucination:{ pm:'Confident wrong answers — the core reliability risk; mitigate with grounding, citations, and evals.', eng:'Plausible-but-false generations from likelihood-based decoding untethered from ground truth.' },
  mcp:{ pm:'A standard that lets any AI plug into your tools without custom builds — faster integrations, less lock-in.', eng:'An open protocol for tool/data discovery and invocation between a model host and external servers.' },
  chainofthought:{ pm:'Letting the model reason step by step — better accuracy on hard tasks, now built into reasoning models.', eng:'Intermediate reasoning tokens before the answer; boosts multi-step tasks, often internalized in reasoning models.' },
  temperature:{ pm:'A creativity dial — low for reliable extraction, high for brainstorming variety.', eng:'Softmax scaling on next-token logits; higher flattens the distribution, lower sharpens it.' },
  promptinjection:{ pm:'A security risk where malicious text hijacks your AI — a key reason to gate agent actions.', eng:'Adversarial instructions in untrusted input the model executes; mitigate via isolation + approval, not solved.' },
};

window.DECODER_STATUS = {
  Core:       { label:'Core',       sym:'●', color:'oklch(0.5 0.085 155)', bg:'oklch(0.955 0.03 155)' },
  Rising:     { label:'Rising',     sym:'▲', color:'oklch(0.56 0.12 55)',  bg:'oklch(0.955 0.05 72)'  },
  Fading:     { label:'Fading',     sym:'▼', color:'oklch(0.55 0.05 250)', bg:'oklch(0.955 0.022 250)'},
  Historical: { label:'Historical', sym:'†', color:'oklch(0.5 0 0)',       bg:'oklch(0.925 0 0)'      },
};
