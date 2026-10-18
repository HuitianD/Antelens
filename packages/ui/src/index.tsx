'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Drawer({open,onOpenChange,title,children}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;children:ReactNode}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className="drawer" aria-describedby={undefined}><header className="drawer-header"><Dialog.Title className="eyebrow">{title}</Dialog.Title><Dialog.Close className="close-btn" aria-label="Close case"><X size={18}/></Dialog.Close></header><div className="drawer-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Modal({open,onOpenChange,onCloseFocus,title,children}:{open:boolean;onOpenChange:(open:boolean)=>void;onCloseFocus?:()=>void;title:string;children:ReactNode}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="overlay image-overlay"/><Dialog.Content className="image-dialog" aria-describedby={undefined} onCloseAutoFocus={event=>{if(onCloseFocus){event.preventDefault();onCloseFocus()}}}><header className="image-dialog-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="close-btn" aria-label="Close screenshot"><X size={18}/></Dialog.Close></header>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function EmptyState({title,children,action}:{title:string;children?:ReactNode;action?:ReactNode}){return <div className="empty"><span className="empty-lens" aria-hidden="true"><Search size={30} strokeWidth={1.25}/></span><h3>{title}</h3>{children&&<p>{children}</p>}{action&&<div className="empty-action">{action}</div>}</div>}
