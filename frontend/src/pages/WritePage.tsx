import { useParams } from 'react-router-dom';
import LetterEditor from '../components/LetterEditor';

export default function WritePage() {
  // When the URL is /write/:draftId we hand the id down so the editor can
  // fetch the existing record and update it. `respondsTo` is reserved for
  // letters opened from a reading flow (TODO: pass through via location.state
  // when wiring the "Respond" button on the read page).
  const { draftId } = useParams();
  return <LetterEditor draftId={draftId} />;
}
