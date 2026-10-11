/** A gate name inside SVG text, as it appears on the circuit. "U_f" renders the f as a subscript. */
export function SvgGlyph({ text }: { text: string }) {
  const [main, sub] = text.split('_')
  return (
    <>
      {main}
      {sub && (
        <tspan dy="7" style={{ fontSize: '0.62em' }}>
          {sub}
        </tspan>
      )}
    </>
  )
}
