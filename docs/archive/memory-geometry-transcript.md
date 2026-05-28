Hey. Do you know about Google's new paper too, the TurboQuant or PolarQuant more specifically?

Mar 30
I'm not immediately familiar with those specific papers. Let me search for what Google's released recently on those quantization approaches.


Searched the web
Searched the web
Ah yeah, this just dropped like a week ago, right? So TurboQuant is Google's KV-cache compression approach that claims six times memory reduction and eight times speedup with minimal quality loss. PolarQuant is the core quantization piece of that — it converts Cartesian coordinates into polar format to skip expensive normalization steps and compress vectors down to really compact representations.

The thing that's interesting to me is it's training-free and model-agnostic, so it just slots into any transformer. Are you thinking about this in the context of your agent work, or more curious about where the efficiency gains are actually coming from?

Now what I'm more interested in is if you contrast this to the brain. So if we look at the brain, right, and its memory is an... you know, the cortical columns or storing information that are going through to the prefrontal cortex, and then there's the hippocampus, they're all, you know, storing information. They're called... so the question here that I'm actually interested in is if we went from Cartesian to whatever other coordinate system, polychondria, makes me wonder what's coordinated system is the brain using?

Mar 30
Hmm, that's a fascinating angle. So you're asking if the brain has some native coordinate system that it's optimized around, and whether converting to polar might actually be getting closer to how biological neural systems naturally represent and compress information?

That's genuinely interesting because the brain definitely isn't using Cartesian coordinates for most things — there's stuff like place cells in the hippocampus that fire based on spatial location, but at a higher level, cortical representations seem to be more about... relational structure and patterns than absolute coordinate geometry. Like, the brain seems to compress information through dimensionality reduction and sparse coding — only a small percentage of neurons firing at once, which is efficient. And there's emerging work on how the brain might use hyperbolic geometry for hierarchical information, or how neural manifolds in motor cortex seem to have their own intrinsic structure that doesn't map neatly to Cartesian space.

So your intuition might be onto something — maybe polar or some other coordinate system is actually more "brain-native" for certain types of compression because it reduces the expensive normalization operations the way your cortex might naturally avoid them. But I'd be honest, I'm not sure if there's direct neuroscience literature mapping "what coordinate system the brain uses" in a clean way. That's kind of a trip though. You thinking about this as inspiration for how to structure agent memory systems?

Yeah. Well, my my real thought here is is we've only explored a few coordinate systems. And if the brain is storing information in high dimensional space, which it likely is, you know, and then as you say, obviously, there's multiple coordinate systems, is likely one for logic that we haven't explored. We might not even know what the coordinate system is yet, but it might be inferable from the brain.

Mar 30
Yeah, that's a really compelling thought. You're essentially saying the brain might be using a coordinate system we haven't even formalized yet — and that if we reverse-engineered it from neuroscience data, we could discover new ways to compress and organize information that we wouldn't arrive at through pure mathematics alone.

That's different from just optimizing existing frameworks. It's like asking: what if there's a fundamentally more efficient way to represent high-dimensional information that evolution already solved, but we're still working in the dark because we're starting from our own mathematical intuitions rather than asking what the brain actually does?

The tricky part is that neuroscience gives us patterns — sparse firing, hierarchical organization, feedback loops — but inferring the actual coordinate system from neural activity is really hard. You'd need to somehow map the structure of cortical columns and hippocampal organization onto a coherent mathematical framework and then test if it actually compresses better than polar or other known systems.

Have you thought about whether that's something you'd actually want to explore, or is this more of a "wouldn't it be interesting" kind of thought?

Right.

Mar 30
You're essentially saying we might reverse-engineer a more optimal coordinate system by studying how the brain actually organizes high-dimensional information — that there could be a coordinate system better suited to how biological neural networks naturally compress and store things than either Cartesian or polar. And we just haven't found it yet because we've been working from mathematical convenience rather than from neuroscience observation.

That actually connects to some of the work on neural manifolds and how neurons seem to organize around lower-dimensional subspaces within that high-dimensional space. Like, if you can figure out what structure the brain is exploiting to compress information, that might unlock something more fundamental than what we've tried so far.

Okay. So, basically, it... what we know... well, what I know about, right, so far is that it's dependent on structure. The structure forms what it's encoding or or is optimized for that because that's been the driver of it, how the brain or how the neurons evolve and work is that they basically use some kind of simplified algorithm to grow or not grow, can ever happen. You know, it's just some very low level operation that basically gives it that shape. Like, there's some kind of fractal algorithm.

Mar 30
Right.

Mar 30
Right, so you're saying the structure itself — the physical topology of how neurons connect, how they organize spatially — that structure emerges from simple local growth rules, almost like a fractal or self-organizing system. And then whatever coordinate system the brain uses for encoding information is naturally aligned with that structure because it evolved together with it.

So it's not like the brain chose a coordinate system and then built its anatomy around it — it's the opposite. The growth algorithm created the structure, and the encoding is inherently optimized for that particular geometry. Which means if you could identify or infer what coordinate system that structure naturally uses, you'd get compression and efficiency for free because it's literally baked into how the thing is built.

That's a different hunt entirely than just trying new mathematical coordinate systems.

Yes. And and more so than that, just to add to that, I don't know if you... the evolution of selective freshness has groomed all the other options that it's already exhaustive search for us, and we are now in a local maxima... minima of of this pattern.

Mar 30
Ah, so you're saying evolution through natural selection has already done an exhaustive search across the space of possible coordinate systems and organizational structures — it's already tested countless variations — and what we see in the brain now is the local optimum it settled into. Which means if we can infer that system, we're not just discovering something interesting, we're potentially uncovering a genuinely optimal solution that's been refined over millions of years of selection pressure.

That's a pretty profound reframing. It's not "the brain happens to use this structure," it's "the brain is at a local optimum because evolution eliminated everything worse." So reverse-engineering it isn't just neat, it could point us toward fundamental efficiency principles we wouldn't discover through pure mathematical exploration alone.

Yes. Okay. So the start out the way that we start here. Right? We know the structure. We probably don't know the evolutionary rule that... or the growth rule, but we do know the shape. So I guess, obviously, the first part is to identify which parts of the brain are relevant here.

Mar 30
Yeah, that makes sense. So you're working backwards from what we can observe — the actual anatomical structure we can map — to infer what growth rules would produce that, and then what coordinate system would naturally fit that geometry.

Which brain regions are you thinking about? Like, are you looking at cortical columns as the foundational unit, or something broader like how the hippocampus and prefrontal cortex connect? Or are you thinking there's a specific region where the organizational principle is clearest?

to you. I'm gonna need you to elaborate a bit because you're the brain expert. I think I am more thinking that the hippocampus is already compressing the signal from the prefrontal cortex and writing those back to the cortex, you know, during sleep. So it makes sense that that is the limiting factor of what goes into long term memory anyway.

Mar 30
Right, so you're saying the hippocampus is the bottleneck — it's receiving high-dimensional information from the cortex, compressing it during consolidation, and then replaying it back during sleep to encode into long-term cortical storage. So whatever coordinate system is optimized for that compression task is probably the one worth reverse-engineering, because that's where the actual information loss happens.

That's actually smart framing because most of the brain's structure is doing other things — motor control, sensory processing — but the hippocampus is explicitly solving a compression problem. It's literally built to take messy, high-dimensional cortical patterns and squeeze them down into something storable.

The thing I'd want to dig into is whether we actually understand the hippocampal compression mechanism well enough to infer a coordinate system from it. Like, place cells and grid cells give us spatial representations, but is there work on the actual geometry of how hippocampal networks compress cortical patterns? Because if that's well-characterized, you've got your starting point.

If you can't do any of this, it's gonna be... it's between the link system and the existing system.

Mar 30
Good morning. I'm peaking his So what I'm saying is we can't do any research a lot of research put there, that we can push infer from multiple sources to kind of build up this map.

Mar 30
Yeah exactly — you're not starting from scratch, you're doing a synthesis job. Pull from what's already known across neuroscience, information theory, geometry, and maybe even developmental biology for the growth rules, and piece together a coherent picture.

So the map you're building would probably layer something like:

Hippocampal structure and known compression mechanisms (place cells, grid cells, theta sequences, memory consolidation during sleep)
What we know about how cortical columns encode and represent information
The mathematical properties of whatever coordinate systems seem to fit those structures naturally
And then what that implies about an optimal coordinate system for high-dimensional sparse encoding
The synthesis itself might be the contribution — nobody may have explicitly connected those dots into "here's the implied coordinate system." That's the inference step that could be novel.

Where would you want to start pulling from first?

Hold on. This really is it's hard for it to understand here because there is wind. So transcription keeps breaking. And giving you the wrong message. What I'm trying to say is that we need I need you to look at existing research that's out there with this lens of this understanding and trying to bridge the gap between that likely existing research has been focused on something specific, and my assumption is that we can tease out this information from Existing research. So in other words, this angle has not been explored in-depth and we need to look at it through existing research and try to build the map and and see what's missing, what information is there,

Mar 30
Got it, that's much clearer. So the hypothesis is that the answer is probably already latent in existing research — neuroscience papers on hippocampal encoding, grid cell geometry, neural manifolds, sparse coding — but nobody has looked at it through the specific lens of "what coordinate system does this imply?"

So what you want to do is essentially a literature synthesis with a specific question driving it: what is the native coordinate system of biological memory compression?

The existing research probably has the pieces — just framed around different questions like "how do grid cells navigate" or "how does memory consolidation work" — and the job is to reframe those findings through your lens and see what falls out.

A few areas I'd expect to be most productive to mine:

Grid cell geometry — already known to use hexagonal/triangular lattices, which has a non-Cartesian structure. There's actually a lot of work connecting grid cells to efficient coding theory.
Neural manifold literature — work by people like Surya Ganguli on how high-dimensional neural activity lives on low-dimensional manifolds
Hippocampal replay and theta sequences — the actual mechanism of compression during consolidation
Sparse distributed representations — Numenta/Hawkins work on cortical columns
Should I do a deeper dive into any of these to start building that map?

Yes please

Mar 30
Let me do a proper search across these areas.


Searched the web
Searched the web
I don't have web search available in this conversation unfortunately. But I can do a solid synthesis from what I know — which is actually quite deep on this topic — and flag where the gaps are that you'd want to go look up.

Let me lay out what I think the map looks like so far:

Grid Cells — the strongest signal Grid cells in the entorhinal cortex fire in hexagonal lattice patterns. Critically, researchers like Yann LeCun and others have noted that hexagonal tiling is the most efficient way to tile 2D space — minimum redundancy, maximum coverage. But more interesting is that grid cells operate at multiple scales simultaneously, like a number system with different bases. That's essentially a multi-resolution coordinate system. Some theorists think this generalizes beyond spatial navigation to abstract conceptual spaces.

Neural Manifolds — Ganguli and others High-dimensional neural activity consistently lives on much lower-dimensional curved manifolds. The brain isn't using the full dimensionality available — it's exploiting intrinsic geometric structure. The coordinate system implied here is more like a Riemannian manifold than anything flat.

Hippocampal Compression The hippocampus seems to encode relational structure — not raw features but relationships between things. That's topological rather than metric. Which suggests the coordinate system might be graph or topology-based rather than geometric in the traditional sense.

The gap nobody seems to have bridged Nobody has explicitly asked: across all of these, what single coordinate system unifies them?

That's your novel angle. Want me to go deeper on any one of these threads?

Okay I have enabled research does that help

Mar 30
Yes, perfect! Let me kick off a proper deep research dive now.


Brain's native memory coordinate system
Research complete
•
3 sources
•
1h 6m
Your research report on the brain's native coordinate system for memory compression is ready. It synthesizes evidence across grid cell geometry, neural manifold topology, sparse coding theory, hippocampal compression mechanisms, hyperbolic geometry, and developmental neuroscience. The report proposes a product manifold architecture (toroidal × hyperbolic × Euclidean) as the brain's unified compression framework, maps each component's evidence level from established to speculative, and identifies four critical empirical gaps — most notably the untested prediction of negative curvature in neural manifolds encoding hierarchical knowledge.

The Brain's Native Coordinate System for Memory Compression: A Product Manifold Architecture
Document 
Okay. Well, that was a good document, I think. I think it's still rough. And, I just wanna clarify, where where are we going with this is we won't try to experiment verify things experimentally. How we would try to experiment or validate these things is with computational by stimulating them. Right? Not necessarily. With neural networks. Or transformers But we should be able to create simple code that models these structures. That's it's not optimized for performance, but, I mean, we should be able to model this. Right?

Mar 30
Yeah absolutely. You're talking about computational simulation — not ML training, not GPU-scale transformer experiments, just clean mathematical models that demonstrate the geometric properties and compression behaviour. Like:

A simple simulation of a toroidal grid code showing how modular periodic codes achieve exponential capacity
A sparse combinatorial code demonstrating the quasi-orthogonality and capacity properties
A hyperbolic embedding vs Euclidean embedding comparison on a simple tree-structured dataset showing the compression advantage
These are all tractable in pure Python — numpy, scipy, maybe networkx for graph structure. No neural networks needed. You're essentially just verifying the mathematical claims computationally, which is a completely legitimate validation approach.

The question I'd want to nail down before we go further is: what's the order here? Because there are really two distinct things to validate:

Each geometric component in isolation — does toroidal coding actually achieve exponential capacity? Does hyperbolic space actually compress hierarchies better?
The product manifold integration — can you combine them and show the composite outperforms any single geometry on mixed data?
Where do you want to start — pick one component first to build confidence, or sketch out the full architecture first and then fill in each piece?

Okay. That's good. Because that's one thing I wasn't actually 100 percent, clear about in the document that you sent there. What is actually proven And one is claims that we have made or or conclusions we've drawn.

Mar 30
Yeah that's a really important distinction and honestly the document blurred the lines a bit. Let me fix that properly.

There are really three tiers:

Tier 1 — Experimentally established (we can point to specific papers with replicable results)

Grid cells fire in hexagonal lattices ✓
Grid cell population activity lies on a toroidal manifold ✓ (Gardner et al. 2022)
Multi-scale grid modules with geometric spacing ratios ✓
Temporal compression during sharp-wave ripples ✓
Sparse coding in dentate gyrus ✓
Grid-like signals in abstract conceptual spaces in humans ✓
Tier 2 — Mathematically proven but not yet confirmed in neural data

Hexagonal lattice is information-theoretically optimal for 2D coding ✓ (proven)
Hyperbolic space compresses hierarchical data exponentially better than Euclidean ✓ (proven in math/ML)
Sparse codes have exponential capacity ✓ (proven)
Tier 3 — Our synthesis / novel claims

The brain uses a product manifold T^k × H^d × ℝ^n
Hyperbolic geometry applies to conceptual hierarchies in neural tissue
Developmental fractal branching hardwires hyperbolic geometry
The three components form a unified compression architecture
So the computational simulations would primarily validate Tier 2 — showing the mathematical proofs hold up in practice — which then makes Tier 3 more plausible. Does that framing feel right?

And just so that I am a 100% sure we're talking about the same thing. When you say compression, what I'm hearing is it's encoding of reality. Compressing it into a format that can be stored in some medium. Are we on the same page?

Mar 30
Yes, exactly the same page. Compression here means the brain is taking raw sensory and experiential reality — which is astronomically high-dimensional — and encoding it into a compact internal representation that can be stored in biological tissue and later reconstructed.

The interesting nuance though is that it's lossy compression optimized for utility, not fidelity. The brain isn't trying to store a perfect copy of reality. It's extracting and storing the structure, the relationships, the patterns — the parts that are predictively useful — and discarding the rest. Which is why the coordinate system matters so much. The coordinate system determines what gets preserved and what gets thrown away during that encoding step.

So when we simulate this, we're essentially asking: given a coordinate system, what does it naturally preserve and what does it naturally discard? And does that match what we observe the brain actually remembering versus forgetting?
