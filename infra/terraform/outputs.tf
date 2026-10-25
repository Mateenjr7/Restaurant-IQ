output "cluster_name" {
  description = "EKS cluster name for kubectl configuration."
  value       = module.eks.cluster_name
}

output "aws_region" {
  description = "AWS region containing the cluster."
  value       = var.aws_region
}

output "configure_kubectl" {
  description = "Command to configure kubectl for this EKS cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "worker_node_group" {
  description = "EKS managed node group name."
  value       = module.eks.eks_managed_node_groups["capstone"].node_group_name
}
