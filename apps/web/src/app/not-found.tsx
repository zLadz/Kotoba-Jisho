import Link from 'next/link';

export default function NotFoundPage(): React.JSX.Element {
  return (
    <main className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Palavra não encontrada</h1>
      <p className="text-slate-600">A entrada solicitada não existe no dicionário.</p>
      <Link href="/" className="text-sky-700 underline">
        Voltar à busca
      </Link>
    </main>
  );
}
