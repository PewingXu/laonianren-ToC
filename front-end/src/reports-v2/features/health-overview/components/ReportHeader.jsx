import { MaterialSymbol } from './MaterialSymbol';

export function ReportHeader({ recordedAt, onShare }) {
  return (
    <header className="health-overview__report-header bg-transparent flex justify-between items-center w-full px-page-padding max-w-canvas-width mx-auto py-8">
      <div>
        <h1 className="type-page-title font-headline text-headline font-bold text-on-surface">您的专属健康日记</h1>
        <p className="health-overview__recorded-at font-caption text-caption text-secondary mt-2 flex items-center gap-1 opacity-80">
          <MaterialSymbol name="schedule" className="text-sm" />
          <span>记录于 {recordedAt}</span>
        </p>
      </div>
      <button
        type="button"
        className="health-overview__share-button flex items-center gap-2 px-6 py-3 bg-white/60 backdrop-blur-md border border-natural-green/20 rounded-full text-natural-green font-subtitle text-subtitle shadow-sm"
        onClick={onShare}
      >
        <MaterialSymbol name="ios_share" />
        <span>分享给家人</span>
      </button>
    </header>
  );
}
