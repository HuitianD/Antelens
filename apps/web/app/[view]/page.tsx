import { notFound } from "next/navigation";
import { Dashboard } from "../../components/dashboard";
export default async function Page({params}:{params:Promise<{view:string}>}){const {view}=await params;if(!["overview","messages","activity","connections"].includes(view))notFound();return <Dashboard/>}
