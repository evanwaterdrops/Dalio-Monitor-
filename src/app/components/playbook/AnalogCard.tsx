import episodesData from "@/lib/playbook/episodes.json";
import HorizonTable from "./HorizonTable";

/** Server-safe — pulls its own episode record, no props beyond the id. */
export default function AnalogCard({ episodeId }: { episodeId: string }) {
  const episode = (episodesData as any[]).find(e => e.id === episodeId);
  if (!episode) return null;

  return (
    <div className="analog-card">
      <div className="analog-card-header">
        <span className="analog-card-name">{episode.name}</span>
        <span className="analog-card-daterange">{episode.dateRange}</span>
      </div>
      <p className="analog-card-takeaway">{episode.takeaway}</p>
      <HorizonTable episodeId={episodeId} anchor={episode.anchorMonth} />
    </div>
  );
}
