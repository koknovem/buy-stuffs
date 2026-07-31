export function AiLoadingPanel({
  title = 'AI 寫緊買餸清單',
  detail = '通常要幾秒，請唔好關閉頁面～',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="ai-loading" role="status" aria-live="polite">
      <div className="ai-loading-orb" aria-hidden>
        <span className="ai-loading-spark">✨</span>
      </div>
      <p className="ai-loading-title">{title}</p>
      <p className="ai-loading-detail">{detail}</p>
      <div className="ai-loading-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
