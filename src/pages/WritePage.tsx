import { useParams } from 'react-router-dom';
import LetterEditor from '../components/LetterEditor';
import { letters } from '../data/mock';

export default function WritePage() {
  const { draftId } = useParams();
  const respondsTo = draftId ? letters.find((l) => l.id === draftId)?.respondsTo : undefined;
  return <LetterEditor respondsTo={respondsTo} />;
}
