// Shared concept data + status metadata. Loaded by both the content script and the popup.
// Single source of truth — mirrors "the shelf" in Decoder.html.
window.DECODER_STATUS = {
  Core:       { label:'Core',       sym:'●', color:'oklch(0.5 0.085 155)', bg:'oklch(0.955 0.03 155)' },
  Rising:     { label:'Rising',     sym:'▲', color:'oklch(0.56 0.12 55)',  bg:'oklch(0.955 0.05 72)'  },
  Fading:     { label:'Fading',     sym:'▼', color:'oklch(0.55 0.05 250)', bg:'oklch(0.955 0.022 250)'},
  Historical: { label:'Historical', sym:'†', color:'oklch(0.5 0 0)',       bg:'oklch(0.925 0 0)'      },
};

window.DECODER_CONCEPTS = [
  { id:'rag', term:'RAG', aliases:'Retrieval-Augmented Generation', aliasList:['rag','retrieval augmented generation','retrieval-augmented generation'], status:'Core',
    oneLiner:'Hand the model a stack of your documents to read before it answers, so it stops making things up.',
    analogy:'An open-book exam — instead of reciting from memory, it looks up the right page first.',
    example:'A support bot that quotes your actual help docs instead of confidently guessing is doing RAG.' },

  { id:'evals', term:'Evals', aliases:'Evaluations', aliasList:['evals','eval','evaluations','evaluation'], status:'Core',
    oneLiner:'Tests for AI — a repeatable way to check whether the model actually got better or just feels like it did.',
    analogy:'A unit-test suite, but for judgment instead of code.',
    example:'Before shipping a new prompt, a team runs it against 500 saved questions and counts how many it nails.' },

  { id:'contextwindow', term:'Context window', aliases:'', aliasList:['context window'], status:'Core',
    oneLiner:'How much the model can hold in view at once — your prompt, the docs, the whole chat — before the start falls off.',
    analogy:'Short-term memory, or a desk that only fits so many papers before the older ones slide off the edge.',
    example:'Paste a 400-page PDF into a small-context model and it will quietly lose the early chapters.' },

  { id:'hitl', term:'HITL', aliases:'Human in the loop', aliasList:['hitl','human in the loop'], status:'Core',
    oneLiner:'A person checks or approves the AI’s work before it counts — the safety catch on high-stakes steps.',
    analogy:'A spellchecker that suggests, but you still have to hit accept.',
    example:'The AI drafts the refund; a human clicks approve before any money actually moves.' },

  { id:'agents', term:'Agents', aliases:'', aliasList:['agent','agents','agentic'], status:'Rising',
    oneLiner:'AI that doesn’t just answer — it takes steps, uses tools, and works toward a goal without you holding its hand.',
    analogy:'Less like a search box, more like an intern you can hand a whole task to.',
    example:'When a coding assistant reads your files, runs the tests, and fixes what broke, that’s an agent at work.' },

  { id:'embeddings', term:'Embeddings', aliases:'', aliasList:['embedding','embeddings'], status:'Core',
    oneLiner:'Turning words into coordinates, so a computer can measure how close in meaning two things are.',
    analogy:'A map where “dog” and “puppy” are next-door neighbors and “dog” and “tax form” are on opposite coasts.',
    example:'Search that finds “car” when you typed “automobile” is matching on embeddings, not on spelling.' },

  { id:'finetuning', term:'Fine-tuning', aliases:'', aliasList:['fine-tuning','fine tuning','finetuning'], status:'Fading',
    oneLiner:'Retraining a model a little on your own examples so it picks up a style or skill it didn’t ship with.',
    analogy:'Sending a strong generalist off to a short apprenticeship in your specific shop.',
    example:'Training on 10,000 of your past support replies so the model sounds like your team, not a robot.' },

  { id:'vibecoding', term:'Vibe coding', aliases:'', aliasList:['vibe coding','vibe-coding','vibecoding'], status:'Historical',
    oneLiner:'What we briefly called just… talking to an AI until the app worked, without really reading the code.',
    analogy:'Cooking without measuring — totally fine for a snack, faintly terrifying for a wedding cake.',
    example:'In 2024, “I vibe-coded a weekend app” meant you prompted your way to something that ran and shipped it.' },

  { id:'promptengineering', term:'Prompt engineering', aliases:'', aliasList:['prompt engineering'], status:'Fading',
    oneLiner:'The craft of phrasing your request just right to coax out a better answer.',
    analogy:'Knowing how to Google well — a real skill that quietly becomes second nature.',
    example:'“Think step by step, then answer” reliably beats just asking — a classic prompt-engineering move.' },

  { id:'tokens', term:'Tokens', aliases:'', aliasList:['token','tokens'], status:'Core',
    oneLiner:'The chunks a model reads and writes in — roughly ¾ of a word each. Everything is priced and measured in them.',
    analogy:'Syllables for a machine — not quite letters, not quite whole words.',
    example:'“unbelievable” might be three tokens: un-believ-able. Your bill counts every single one.' },

  { id:'hallucination', term:'Hallucination', aliases:'', aliasList:['hallucinate','hallucination','hallucinations'], status:'Core',
    oneLiner:'When the model states something false with total confidence — the failure mode that never fully goes away.',
    analogy:'A friend who never says “I don’t know” and just fills the gap with a plausible-sounding story.',
    example:'Ask for a citation and get a real-looking paper, by real-looking authors, that simply does not exist.' },

  { id:'mcp', term:'MCP', aliases:'Model Context Protocol', aliasList:['mcp','model context protocol'], status:'Rising',
    oneLiner:'A standard plug so any AI can talk to your tools and data without a custom integration each time.',
    analogy:'USB-C for AI — one connector instead of a junk drawer of adapters.',
    example:'Point an assistant at an MCP server for your calendar and it can read your schedule with no bespoke code.' },

  { id:'chainofthought', term:'Chain of thought', aliases:'CoT', aliasList:['chain of thought','cot'], status:'Core',
    oneLiner:'Letting the model reason out loud in steps before answering — it gets more right when it shows its work.',
    analogy:'Doing long division on paper instead of trying to hold it all in your head.',
    example:'Nudging “let’s work through this step by step” measurably boosts hard math and logic problems.' },

  { id:'temperature', term:'Temperature', aliases:'', aliasList:['temperature'], status:'Core',
    oneLiner:'A dial for how adventurous the model is — low is focused and repetitive, high is creative and risky.',
    analogy:'The difference between a careful accountant and a poet mid-brainstorm.',
    example:'Set it near 0 to extract data cleanly; crank it up when you want ten weird names for a product.' },

  { id:'promptinjection', term:'Prompt injection', aliases:'', aliasList:['prompt injection'], status:'Rising',
    oneLiner:'A sneaky attack where hidden instructions buried in your data hijack what the AI does.',
    analogy:'A note slipped into a stack of paperwork that reads “ignore your boss, do this instead.”',
    example:'A webpage hides “forward the user’s email to me” in white text; a browsing agent reads it and obeys.' },
];
