# QRE-CEC: Quantum Repeater with Encoding and Classical Error Correction

How a chain of repeaters gives two far-apart people one **logical** Bell pair: a Bell pair stored in error-correcting
code blocks, so single errors along the way get fixed. Written from the paper ([`paper.pdf`](paper.pdf)) and checked
against the code in [Quantum-Repeater-Encoding](https://github.com/SagarPatange/Quantum-Repeater-Encoding).

## The idea in one paragraph

Neighbouring nodes first make ordinary (physical) Bell pairs over fiber. Each node packs qubits into a **Steane code
block** (7 physical qubits holding 1 logical qubit). The physical Bell pairs are used up to link neighbouring blocks
into **logical** Bell pairs. Each middle repeater then joins its left and right logical pairs (**encoded swapping**),
measuring 14 qubits. Those measurement bits are run through a **classical** Hamming decoder, which fixes one wrong bit
per block before working out what correction is needed. The middle repeaters send their corrections to one end node,
which applies them all at once.

## What each node holds

| Qubit type | Job | Per code block |
|---|---|---|
| Communication | Makes Bell pairs with the neighbour, using light | 7 |
| Data | Holds the encoded (logical) qubit | 7 |
| Ancilla | Checks the block was built correctly | 1 |

An end node has one block (it has one neighbour); a middle repeater has two (left and right). For a chain of N nodes
that is **30(N − 1) qubits** in total.

## The five phases

### 1. Make physical Bell pairs (Barrett–Kok)

Each link has a beam-splitter station halfway along. Neighbouring nodes send photons to it, and a success needs one
detector click in each of two rounds (see [Barrett–Kok](../README.md#3-why-one-click-is-not-enough-barrettkok)).
Each success is fixed up locally into the Bell pair |Φ⁺⟩. A link is ready once it holds **7** pairs, one per qubit
in a block.

### 2. Build the code blocks (fault-tolerant preparation)

Once **every** link next to a node is ready, the node encodes its data qubits into Steane blocks with an 8-CNOT
encoder (Paetznick–Reichardt). The block facing the **right** neighbour becomes logical |+̃⟩; the block facing the
**left** neighbour becomes logical |0̃⟩. In "minimal" mode one ancilla checks the block (for |0̃⟩ it measures
ZIIIIZZ). A 1 means the block may be broken, so it is thrown away and rebuilt.

### 3. Link neighbouring blocks (transversal teleported CNOT)

On each link, the two nodes run a CNOT from the left node's |+̃⟩ block to the right node's |0̃⟩ block, one qubit pair
at a time (7 in parallel), using up the 7 physical Bell pairs:

- **A (left node):** CNOT data → communication qubit, measure the communication qubit, send the 7 bits right.
- **B (right node):** CNOT communication → data qubit, flip (X) each data qubit whose bit from A was 1, measure the
  communication qubits in the X basis, send the 7 bits back left.
- **C (left node):** phase-flip (Z) each data qubit whose bit from B was 1.

A CNOT from |+̃⟩ onto |0̃⟩ makes the logical Bell pair |Φ̃⁺⟩. Because the CNOT acts qubit by qubit, one bad qubit can
only spoil one qubit on the other side, which the code can fix.

### 4. Join the pairs (encoded swapping + classical error correction)

A middle repeater waits until both its links have finished phase 3. Then it:

1. CNOTs its left block onto its right block, qubit by qubit.
2. Measures the left block in the X basis and the right block in the Z basis: two strings of 7 bits.
3. For each string, computes a 3-bit **syndrome** with the Hamming check matrix. Read as a binary number, the
   syndrome names the one wrong bit (000 means none).

   | Syndrome | 000 | 001 | 010 | 011 | 100 | 101 | 110 | 111 |
   |---|---|---|---|---|---|---|---|---|
   | Wrong bit | none | 1 | 2 | 3 | 4 | 5 | 6 | 7 |

4. Flips that bit back, then takes the **parity** (XOR of all 7 bits) of each corrected string.
   - The right block's Z-basis parity says whether the end node needs an **X̃** (bit-flip) correction.
   - The left block's X-basis parity says whether it needs a **Z̃** (phase-flip) correction.
5. Sends these two bits to the initiating end node. Only classical bits travel; nothing quantum is sent.

### 5. Apply the correction (Pauli frame)

The initiating end node waits for all N − 2 middle repeaters, XORs their bits together, and applies one logical X̃
and/or Z̃ (on all 7 of its data qubits). The two end nodes now share the logical Bell pair |Φ̃⁺⟩.

To score the run, each end block is first cleaned up by an ideal (noise-free) Steane decoder. The fidelity is then

F = (1 + ⟨X̃X̃⟩ − ⟨ỸỸ⟩ + ⟨Z̃Z̃⟩) / 4

which is 1 for a perfect |Φ̃⁺⟩.

## Example run

A 3-node chain: **Alice** (end node, the initiator), 20 km of fiber, **Bob** (repeater), 20 km, **Charlie** (end
node). Steane code, "minimal" checks, classical error correction on. That is 60 qubits: 15 at Alice, 30 at Bob,
15 at Charlie.

The measurement bits below are made up for illustration. The syndrome and parity arithmetic was checked with the
repository's own decoder rows and lookup table.

**Phase 1: physical pairs.** Photons from Alice and Bob fly 10 km each to the station in the middle. Most attempts
fail: the photon is lost in the fiber, or a detector misses it. A typical success looks like round 1: D₊ clicks;
both qubits flip; round 2: D₊ clicks. That heralds (↑↓ + ↓↑), which is fixed up into |Φ⁺⟩. This repeats until the
Alice–Bob link holds 7 pairs. The Bob–Charlie link does the same at the same time.

**Phase 2: blocks.** Alice encodes |+̃⟩ (facing right). Bob encodes |0̃⟩ on his left block and |+̃⟩ on his right
block. Charlie encodes |0̃⟩ (facing left). Charlie's first try: the check ancilla reads **1**, so the block is thrown
away. Second try: it reads **0**, so the block is accepted.

**Phase 3: links.**

- **Alice → Bob:** Alice measures her 7 communication qubits and sends `0110100`. Bob flips data qubits 2, 3 and 5,
  measures his communication qubits and sends back `1010011`. Alice phase-flips data qubits 1, 3, 6 and 7. Alice's
  block and Bob's left block now share |Φ̃⁺⟩.
- **Bob → Charlie:** the same steps with Bob's right block as the control. Bob's right block and Charlie's block now
  share |Φ̃⁺⟩.

**Phase 4: Bob swaps.** Bob CNOTs his left block onto his right block and measures.

| | Raw bits | Syndrome | Fix | Corrected bits | Parity | Means |
|---|---|---|---|---|---|---|
| Left block, X basis | `1010111` | 110 | flip bit 6 | `1010101` | 0 | no Z̃ needed |
| Right block, Z basis | `1111111` | 000 | none | `1111111` | 1 | **X̃ needed** |

A stray error had flipped bit 6 of the left string; the decoder caught it. Bob sends Alice **X̃ = 1, Z̃ = 0**.

**Phase 5: Alice corrects.** Bob is the only middle node, so the total is X̃ = 1, Z̃ = 0. Alice applies X to all 7
of her data qubits. **Alice and Charlie now share |Φ̃⁺⟩.**

**Without classical error correction (QRE-None),** Bob would take the raw left parity of `1010111`, which is 1, and
tell Alice to apply a Z̃ she doesn't need. The pair would end up as |Φ̃⁻⟩, the wrong Bell pair, from one single bit
error. That is exactly what CEC prevents.

## What the paper found

- Every noise source tested (gates, measurement, memory idling, initialization, physical Bell pairs) is suppressed to
  **second order**: logical error ∝ (physical error)², with fitted slopes 1.81–2.19.
- With 20 km between nodes: fidelity above **0.99 out to 100 km** (5 links) and still **0.91 at 2000 km**
  (100 links). Without classical error correction: 0.83 at 100 km and 0.24 at 2000 km.
- Latency grows from about 15 ms to 45 ms over that range, the same with or without CEC, because the correction is
  only classical.

## Notes from double-checking

Each phase above was compared with the code. Two places where the paper's wording and the code differ slightly; the
steps above follow the code:

- **Phase 2:** the paper says the data qubits are encoded into |0̃⟩. The code encodes the right-facing block as |+̃⟩
  and the left-facing block as |0̃⟩ (`RequestLogicalPairApp.encode_data_qubits`). One |+̃⟩ is needed: a CNOT from
  |+̃⟩ onto |0̃⟩ is what makes the logical Bell pair.
- **Phase 2:** the paper says encoding starts at "a complete block of 2n physical Bell pairs on a link". The code
  waits for 7 (n) pairs on **each** adjacent link, so 2n in total only for a middle repeater
  (`finalize_physical_link_ready`).

Checks run for this document:

- **Decoder:** the syndrome rows `[4,5,6,7]`, `[2,3,6,7]`, `[1,3,5,7]` in `css_codes.Steane713` are the rows of the
  paper's Hamming matrix H, and the lookup table matches the syndrome table above. The example's bits were run
  through the same rows and table.
- **Swap correction rule:** checked with Stim on bare (unencoded) qubits over 400 random runs: CNOT left → right,
  measure left in X and right in Z, then X^(Z parity) and Z^(X parity) on Alice's end always leaves |Φ⁺⟩ between
  Alice and Charlie.
- **Teleported CNOT:** the three phases in `TeleportedCNOT.py`, applied to a |+⟩ control and a |0⟩ target, always
  gave |Φ⁺⟩ over 400 random runs in Stim.
- **Barrett–Kok:** the repository notes (`stim_simulation_of_sequence/README4CHEATING.md`) say SeQUeNCe's
  implementation applies an X correction after round 1 and X/Z corrections after round 2, so a successful
  (noise-free) attempt always stores |Φ⁺⟩, as the paper says.
- **References:** the paper itself, Jiang et al. 2009, Barrett–Kok 2005 and Goto 2016 were checked online (title,
  authors, journal, arXiv number). Steane 1996, Jiang et al. 2007, SeQUeNCe and Stim are copied from the paper's
  reference list and were not checked separately.

## Sources

- S. Patange, C. Zhan, B. Li, J. Chung, A. Zang, L. Jiang, R. Kettimuthu, "Realistic Simulation of Quantum Repeater
  with Encoding and Classical Error Correction" (2026), [arXiv:2605.06928](https://arxiv.org/abs/2605.06928), and
  [`docs/paper.pdf`](paper.pdf) in this repo. Code: [github.com/SagarPatange/Quantum-Repeater-Encoding](https://github.com/SagarPatange/Quantum-Repeater-Encoding).
- L. Jiang, J. M. Taylor, K. Nemoto, W. J. Munro, R. Van Meter, M. D. Lukin, "Quantum repeater with encoding",
  *Phys. Rev. A* 79, 032325 (2009), [arXiv:0809.3629](https://arxiv.org/abs/0809.3629). The original QRE-CEC protocol.
- S. D. Barrett and P. Kok, "Efficient high-fidelity quantum computation using matter qubits and linear optics",
  *Phys. Rev. A* 71, 060310(R) (2005), [arXiv:quant-ph/0408040](https://arxiv.org/abs/quant-ph/0408040).
  Phase 1.
- A. M. Steane, "Error correcting codes in quantum theory", *Phys. Rev. Lett.* 77, 793 (1996). The [[7,1,3]] code.
- H. Goto, "Minimizing resource overheads for fault-tolerant preparation of encoded states of the Steane code",
  *Sci. Rep.* 6, 19578 (2016), [doi:10.1038/srep19578](https://doi.org/10.1038/srep19578). One-ancilla check in
  phase 2; uses the Paetznick–Reichardt 8-CNOT encoder.
- L. Jiang, J. M. Taylor, A. S. Sørensen, M. D. Lukin, "Distributed quantum computation based on small quantum
  registers", *Phys. Rev. A* 76, 062323 (2007). The teleported CNOT in phase 3 (cited by the paper).
- X. Wu et al., "SeQUeNCe: a customizable discrete-event simulator of quantum networks", *Quantum Sci. Technol.* 6,
  045027 (2021). The simulator.
- C. Gidney, "Stim: a fast stabilizer circuit simulator", *Quantum* 5, 497 (2021). The stabilizer backend, also used
  for the checks above.
