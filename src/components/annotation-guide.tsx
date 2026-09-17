export function AnnotationGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`guide-content ${compact ? "is-compact" : ""}`}>
      <section className="guide-callout">
        <strong>Use exactly one label.</strong>
        <p>Check the language first. If it is eligible, decide whether the reviewed experience contains a complaint.</p>
      </section>

      <section>
        <h2>1. Check language eligibility</h2>
        <p>Select <strong>Not Cebuano-English</strong> unless the reviewer’s own message contains at least one clearly Cebuano element and one clearly English element. One clear switched word can qualify.</p>
        <p>Names, brands, menu items, places, usernames, links, numbers, emojis, quotations, and ambiguous shared words cannot establish a language by themselves.</p>
        <div className="guide-examples">
          <p><span>Eligible</span> “Lami ang food.”</p>
          <p><span>Eligible</span> “Very late gyud.”</p>
          <p><span>Not eligible</span> “Lami kaayo sa Jollibee.”</p>
          <p><span>Not eligible</span> “Food was very good.”</p>
        </div>
      </section>

      <section>
        <h2>2. Decide whether it is a complaint</h2>
        <p className="core-rule"><strong>Core rule:</strong> Select <strong>Yes · Complaint</strong> when the reviewer communicates at least one clear problem, negative evaluation, deficiency, or unmet expectation connected to the reviewed experience. Otherwise, select <strong>No · Not complaint</strong>.</p>
        <p>The reviewed experience includes the food, price, portion, packaging, store, order, payment, cancellation, delivery, rider, or ordering process connected to this transaction.</p>
        <ul>
          <li>One clear problem is enough, even when the rest of the review is positive.</li>
          <li>Mild problems count. The reviewer does not need to sound angry.</li>
          <li>A suggestion counts only when it reveals a problem in the reviewed experience.</li>
          <li>Price increases and poor value count when expressed negatively.</li>
          <li>Failed or cancelled attempts to complete the same order count.</li>
          <li>Criticism aimed only at another store or unrelated experience does not count.</li>
          <li>Record that a problem exists without assigning blame the reviewer did not state.</li>
        </ul>
      </section>

      <section>
        <h2>3. Use No when no problem is communicated</h2>
        <p>Select <strong>No · Not complaint</strong> for praise, neutral descriptions, general wishes, and factual details that are not presented as undesirable. Do not infer dissatisfaction that the reviewer did not express.</p>
        <div className="guide-examples">
          <p><span>Complaint</span> “Lami pero dili na init pag-abot nako.”</p>
          <p><span>Complaint</span> “Twice na-cancel pero worth it kay lami.”</p>
          <p><span>Not complaint</span> “Unta naay lain snacks. Good job!”</p>
          <p><span>Not complaint</span> “Lami tanan, five days before expiry.”</p>
        </div>
      </section>

      <section className="guide-callout guide-last">
        <strong>When genuinely unclear</strong>
        <p>If the language is eligible but there is no clearly communicated problem, choose <strong>No</strong>. Use Skip only to return to a difficult review later.</p>
      </section>
    </div>
  );
}
